using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using SeaCharter.Data;
using SeaCharter.DTOs.Pricing;
using SeaCharter.Models.Demurrage;
using SeaCharter.Models.MarketData;
using SeaCharter.Models.Pricing;

namespace SeaCharter.Services.Pricing
{
    /// <summary>
    /// Motor algoritmico de cotizacion para fletes FCL y LCL.
    /// </summary>
    public class PricingEngineService : IPricingEngineService
    {
        private const string DefaultBaseCurrency = "EUR";
        private readonly SeaCharterDbContext _dbContext;
        private MarketReferenceData? _currentMarketReferenceData;

        public PricingEngineService(SeaCharterDbContext dbContext)
        {
            _dbContext = dbContext;
        }

        public QuoteBreakdown CalculateTotalQuote(List<SelectedEquipment> equipmentList, List<Surcharge> allSurcharges)
        {
            return CalculateTotalQuote(equipmentList, allSurcharges, null);
        }

        public QuoteBreakdown CalculateTotalQuote(List<SelectedEquipment> equipmentList, List<Surcharge> allSurcharges, Incoterm? incoterm)
        {
            if (equipmentList == null)
            {
                throw new ArgumentNullException(nameof(equipmentList));
            }

            if (allSurcharges == null)
            {
                throw new ArgumentNullException(nameof(allSurcharges));
            }

            var lines = new List<QuoteBreakdownLineItem>();
            string currency = allSurcharges.Select(item => NormalizeCurrency(item.Currency)).FirstOrDefault() ?? "USD";
            List<Surcharge> normalizedSurcharges = allSurcharges
                .Where(item => !string.IsNullOrWhiteSpace(item.Concept))
                .Select(item => new Surcharge
                {
                    Concept = item.Concept.Trim(),
                    Amount = item.Amount,
                    Currency = NormalizeCurrency(item.Currency),
                    ChargeLevel = item.ChargeLevel,
                    ContainerType = ResolveSurchargeContainerType(item),
                    LinkedEquipmentId = item.LinkedEquipmentId,
                    Category = item.Category
                })
                .Where(item => incoterm == null || IsChargeIncludedByIncoterm(item.Category, incoterm.Value))
                .ToList();

            foreach (SelectedEquipment equipment in equipmentList.Where(item => item.Quantity > 0))
            {
                string containerType = NormalizeContainerType(equipment.ContainerType);
                List<Surcharge> equipmentCharges = normalizedSurcharges
                    .Where(item => IsEquipmentLevel(item.ChargeLevel) && IsLinkedToSelectedEquipment(item, equipment, containerType))
                    .ToList();
                decimal unitAmount = equipmentCharges.Sum(item => item.Amount);
                decimal totalAmount = unitAmount * equipment.Quantity;
                string label = $"Flete para {equipment.Quantity}x {FormatContainerType(containerType)}";

                lines.Add(new QuoteBreakdownLineItem
                {
                    Label = $"{label} = {totalAmount:0.00} {currency}",
                    ContainerType = containerType,
                    Quantity = equipment.Quantity,
                    UnitAmount = unitAmount,
                    TotalAmount = totalAmount,
                    Currency = currency,
                    IsGeneralCharge = false
                });
            }

            decimal generalCharges = normalizedSurcharges
                .Where(item => item.ChargeLevel == ChargeLevel.PerBillOfLading)
                .Sum(item => item.Amount);

            if (generalCharges > 0m)
            {
                lines.Add(new QuoteBreakdownLineItem
                {
                    Label = $"Gastos generales (BL Fee) = {generalCharges:0.00} {currency}",
                    Quantity = 1,
                    UnitAmount = generalCharges,
                    TotalAmount = generalCharges,
                    Currency = currency,
                    IsGeneralCharge = true
                });
            }

            return new QuoteBreakdown
            {
                TotalAmount = lines.Sum(item => item.TotalAmount),
                Currency = currency,
                Lines = lines
            };
        }

        public SalesQuote ApplySalesMargin(List<QuoteSurcharge> costs)
        {
            if (costs == null)
            {
                throw new ArgumentNullException(nameof(costs));
            }

            IReadOnlyCollection<MarginPolicy> marginPolicies = _dbContext.MarginPolicies
                .AsNoTracking()
                .Where(policy => policy.IsActive)
                .ToList();

            var salesQuote = new SalesQuote
            {
                BaseCurrency = costs.Select(cost => NormalizeCurrency(cost.BaseCurrency)).FirstOrDefault() ?? DefaultBaseCurrency,
                PortOfLoading = costs.Select(cost => cost.PortOfLoading).FirstOrDefault(value => !string.IsNullOrWhiteSpace(value)) ?? string.Empty,
                PortOfDischarge = costs.Select(cost => cost.PortOfDischarge).FirstOrDefault(value => !string.IsNullOrWhiteSpace(value)) ?? string.Empty
            };

            foreach (QuoteSurcharge cost in costs)
            {
                ChargeCategory category = ResolveSalesMarginCategory(cost);
                MarginPolicy? policy = marginPolicies.FirstOrDefault(item => item.Category == category)
                    ?? marginPolicies.FirstOrDefault(item => item.Category == ChargeCategory.Surcharge);
                decimal markupPercent = policy?.MarkupPercent ?? 0m;
                decimal fixedFee = policy?.FlatFee ?? 0m;
                decimal sellAmount = cost.Amount + (cost.Amount * markupPercent / 100m) + fixedFee;

                salesQuote.Lines.Add(new SalesQuoteLine
                {
                    Concept = cost.Name,
                    Category = category,
                    ChargeLevel = cost.ChargeLevel,
                    ContainerType = cost.EquipmentType,
                    Currency = ResolveCurrency(cost.CurrencyCode, cost.Currency),
                    Quantity = 1m,
                    CarrierCost = cost.Amount,
                    MarkupPercent = markupPercent,
                    FixedFee = fixedFee,
                    SellAmount = Math.Round(sellAmount, 2, MidpointRounding.AwayFromZero)
                });
            }

            return salesQuote;
        }

        public bool CheckCapacity(decimal cargoVolume, decimal cargoWeight, string containerType, out int suggestedEquipmentCount)
        {
            CapacityCheckResult result = CheckCapacity(cargoVolume, cargoWeight, containerType);
            suggestedEquipmentCount = result.SuggestedEquipmentCount;
            return result.Fits;
        }

        public CapacityCheckResult CheckCapacity(decimal cargoVolume, decimal cargoWeight, string containerType)
        {
            if (cargoVolume < 0m)
            {
                throw new ArgumentOutOfRangeException(nameof(cargoVolume), "El volumen de carga no puede ser negativo.");
            }

            if (cargoWeight < 0m)
            {
                throw new ArgumentOutOfRangeException(nameof(cargoWeight), "El peso de carga no puede ser negativo.");
            }

            if (string.IsNullOrWhiteSpace(containerType))
            {
                throw new ArgumentException("El tipo de contenedor es obligatorio.", nameof(containerType));
            }

            string normalizedContainerType = NormalizeContainerType(containerType);
            ContainerSpecification specification = _dbContext.ContainerSpecifications
                .AsNoTracking()
                .FirstOrDefault(item => item.ContainerType == normalizedContainerType || item.DisplayName == containerType)
                ?? throw new InvalidOperationException($"No existe especificacion tecnica para el contenedor {containerType}.");

            decimal usableVolume = specification.UsableVolumeCbm > 0m
                ? specification.UsableVolumeCbm
                : Math.Round(specification.MaximumVolumeCbm * specification.UtilizationFactor, 2, MidpointRounding.AwayFromZero);
            decimal usablePayload = specification.UsablePayloadKg > 0m
                ? specification.UsablePayloadKg
                : Math.Round(specification.MaximumPayloadKg * specification.UtilizationFactor, 2, MidpointRounding.AwayFromZero);

            int equipmentByVolume = cargoVolume <= 0m ? 1 : (int)Math.Ceiling(cargoVolume / usableVolume);
            int equipmentByWeight = cargoWeight <= 0m ? 1 : (int)Math.Ceiling(cargoWeight / usablePayload);
            int suggestedEquipmentCount = Math.Max(equipmentByVolume, equipmentByWeight);
            bool fits = suggestedEquipmentCount <= 1;

            return new CapacityCheckResult
            {
                Fits = fits,
                SuggestedEquipmentCount = suggestedEquipmentCount,
                UsableVolumeCbm = usableVolume,
                UsablePayloadKg = usablePayload,
                ContainerType = specification.ContainerType,
                Message = fits
                    ? "La carga cabe en un equipo con factor de utilizacion del 90%."
                    : $"La carga excede la capacidad utilizable. Se sugieren {suggestedEquipmentCount} equipos {specification.DisplayName}."
            };
        }

        public async Task<QuoteResponse> CalculateQuoteAsync(QuoteRequest request, CancellationToken cancellationToken = default)
        {
            ValidateRequest(request);

            var lineItems = new List<QuoteLineItemDto>();
            DateTime quoteDate = request.ValidityDate.Date;
            decimal revenueTons = request.Mode == CargoMode.Lcl
                ? Math.Max(request.WeightInTons, request.VolumeInCbm)
                : request.EquipmentQuantity;

            // Filtro 1: Ruta y modalidad. Busca la tarifa base vigente y calcula FCL por equipo o LCL por W/M.
            BaseOceanRate baseRate = await FindBaseRateAsync(request, quoteDate, cancellationToken);
            lineItems.Add(CreateBaseFreightLine(request, baseRate, revenueTons));

            // Filtro 2: Naturaleza de la mercancia. Suma recargos IMO y Reefer cuando aplican.
            IReadOnlyCollection<LogisticCharge> cargoNatureCharges = await FindCargoNatureChargesAsync(request, quoteDate, cancellationToken);
            lineItems.AddRange(cargoNatureCharges.Select(charge => CreateLogisticChargeLine(request, charge, revenueTons)));

            // Filtro 3: Incoterm. Activa o desactiva gastos locales de origen y destino segun responsabilidad contractual.
            IReadOnlyCollection<LogisticCharge> localCharges = await FindLocalChargesAsync(request, quoteDate, cancellationToken);
            lineItems.AddRange(localCharges.Select(charge => CreateLogisticChargeLine(request, charge, revenueTons)));

            // Filtro 4: Recargos dinamicos. Suma PSS, GRI, BAF u otros recargos temporales vigentes para la ruta.
            IReadOnlyCollection<DynamicSurcharge> dynamicSurcharges = await FindDynamicSurchargesAsync(request, quoteDate, cancellationToken);
            lineItems.AddRange(dynamicSurcharges.Select(surcharge => CreateDynamicSurchargeLine(request, surcharge, revenueTons)));

            // Filtro 5: Recargos avanzados de naviera. Imita la quote sheet real agrupando por nivel e instruccion de pago.
            IReadOnlyCollection<QuoteSurcharge> quoteSurcharges = await FindQuoteSurchargesAsync(request, quoteDate, cancellationToken);
            lineItems.AddRange(quoteSurcharges.Select(surcharge => CreateQuoteSurchargeLine(request, surcharge, revenueTons)));
            QuoteBreakdown? breakdownByEquipment = null;
            if (request.Mode == CargoMode.Fcl)
            {
                List<SelectedEquipment> selectedEquipment = ResolveSelectedEquipment(request);
                List<Surcharge> surchargeInputs = quoteSurcharges
                    .Select(item => new Surcharge
                    {
                        Concept = item.Name,
                        Amount = item.Amount,
                        Currency = ResolveCurrency(item.CurrencyCode, item.Currency),
                    ChargeLevel = item.ChargeLevel,
                    ContainerType = item.EquipmentType,
                    Category = ResolveSalesMarginCategory(item)
                })
                    .ToList();

                if (surchargeInputs.Count > 0)
                {
                    breakdownByEquipment = CalculateTotalQuote(selectedEquipment, surchargeInputs, request.Incoterm);
                }
            }

            // Filtro 6: Free time. Valida si los dias libres estan incluidos o si generan un servicio adicional auditable.
            FreeTimeSummaryDto? freeTimeSummary = await CalculateFreeTimeAsync(request, cancellationToken);
            if (freeTimeSummary != null && freeTimeSummary.AdditionalServiceAmount > 0m)
            {
                lineItems.Add(CreateLine(
                    "DND",
                    freeTimeSummary.IsIncludedInOffer ? "Demurrage and detention" : "Free time additional service",
                    ChargeCategory.Surcharge,
                    CalculationBasis.PerShipment,
                    1m,
                    freeTimeSummary.AdditionalServiceAmount,
                    freeTimeSummary.Currency));
            }

            // Filtro 7: Motor de margenes. Convierte Buy Rate a Sell Rate con markup porcentual o flat fee por categoria.
            IReadOnlyCollection<MarginPolicy> marginPolicies = await _dbContext.MarginPolicies
                .AsNoTracking()
                .Where(policy => policy.IsActive)
                .ToListAsync(cancellationToken);

            ApplyMargins(lineItems, marginPolicies);

            string baseCurrency = NormalizeCurrency(baseRate.BaseCurrency);
            _currentMarketReferenceData = await FindLatestMarketReferenceDataAsync(cancellationToken);
            ApplyCurrencyConversion(lineItems, baseCurrency);

            string currency = lineItems.Select(item => item.OriginalCurrency).FirstOrDefault() ?? ResolveCurrency(baseRate.CurrencyCode, baseRate.Currency);
            QuoteDisclaimer? disclaimer = await FindActiveDisclaimerAsync(quoteDate, cancellationToken);

            return new QuoteResponse
            {
                QuoteNumber = $"SCDB-{DateTime.UtcNow:yyyyMMddHHmmss}",
                PortOfLoading = request.PortOfLoading,
                PortOfDischarge = request.PortOfDischarge,
                ValidityDate = quoteDate,
                Mode = request.Mode,
                Incoterm = request.Incoterm,
                RevenueTons = revenueTons,
                Currency = currency,
                BaseCurrency = baseCurrency,
                TotalBuyRate = lineItems.Sum(item => item.OriginalBuyAmount),
                TotalSellRate = lineItems.Sum(item => item.OriginalSellAmount),
                TotalBuyRateBase = lineItems.Sum(item => item.BuyAmount),
                TotalSellRateBase = lineItems.Sum(item => item.SellAmount),
                CurrencyBreakdown = GroupOriginalCurrencyBreakdown(lineItems),
                LineItems = lineItems,
                SurchargeGroups = GroupSurchargesByChargeLevel(lineItems),
                BreakdownByEquipment = breakdownByEquipment,
                FreeTime = freeTimeSummary,
                LegalDisclaimer = disclaimer?.LegalText ?? string.Empty,
                DisclaimerValidUntil = disclaimer?.ValidUntil
            };
        }

        private async Task<BaseOceanRate> FindBaseRateAsync(QuoteRequest request, DateTime quoteDate, CancellationToken cancellationToken)
        {
            BaseOceanRate? rate = await _dbContext.BaseOceanRates
                .AsNoTracking()
                .Where(item =>
                    item.PortOfLoading == request.PortOfLoading &&
                    item.PortOfDischarge == request.PortOfDischarge &&
                    item.Mode == request.Mode &&
                    item.ValidFrom <= quoteDate &&
                    item.ValidTo >= quoteDate)
                .Where(item => request.Mode == CargoMode.Lcl || item.EquipmentType == request.EquipmentType)
                .OrderByDescending(item => item.ValidFrom)
                .FirstOrDefaultAsync(cancellationToken);

            return rate ?? throw new InvalidOperationException("No existe tarifa base vigente para la ruta, modalidad y fecha solicitadas.");
        }

        private async Task<IReadOnlyCollection<LogisticCharge>> FindCargoNatureChargesAsync(QuoteRequest request, DateTime quoteDate, CancellationToken cancellationToken)
        {
            if (!request.IsImo && !request.IsReefer)
            {
                return Array.Empty<LogisticCharge>();
            }

            return await _dbContext.LogisticCharges
                .AsNoTracking()
                .Where(charge =>
                    charge.Category == ChargeCategory.CommodityNature &&
                    charge.ValidFrom <= quoteDate &&
                    charge.ValidTo >= quoteDate &&
                    (charge.PortOfLoading == null || charge.PortOfLoading == request.PortOfLoading) &&
                    (charge.PortOfDischarge == null || charge.PortOfDischarge == request.PortOfDischarge) &&
                    ((request.IsImo && charge.AppliesToImo) || (request.IsReefer && charge.AppliesToReefer)))
                .ToListAsync(cancellationToken);
        }

        private async Task<IReadOnlyCollection<LogisticCharge>> FindLocalChargesAsync(QuoteRequest request, DateTime quoteDate, CancellationToken cancellationToken)
        {
            bool includeOrigin = IsOriginCostIncluded(request.Incoterm);
            bool includeDestination = IsDestinationCostIncluded(request.Incoterm);

            return await _dbContext.LogisticCharges
                .AsNoTracking()
                .Where(charge =>
                    (charge.Category == ChargeCategory.LocalOrigin ||
                     charge.Category == ChargeCategory.LocalDestination ||
                     charge.Category == ChargeCategory.Administrative) &&
                    charge.ValidFrom <= quoteDate &&
                    charge.ValidTo >= quoteDate &&
                    (charge.PortOfLoading == null || charge.PortOfLoading == request.PortOfLoading) &&
                    (charge.PortOfDischarge == null || charge.PortOfDischarge == request.PortOfDischarge))
                .Where(charge =>
                    (includeOrigin && charge.Side == LocalChargeSide.Origin) ||
                    (includeDestination && charge.Side == LocalChargeSide.Destination) ||
                    (charge.Side == null && (includeOrigin || includeDestination)))
                .ToListAsync(cancellationToken);
        }

        private async Task<IReadOnlyCollection<DynamicSurcharge>> FindDynamicSurchargesAsync(QuoteRequest request, DateTime quoteDate, CancellationToken cancellationToken)
        {
            return await _dbContext.DynamicSurcharges
                .AsNoTracking()
                .Where(surcharge =>
                    surcharge.ValidFrom <= quoteDate &&
                    surcharge.ValidTo >= quoteDate &&
                    (surcharge.PortOfLoading == null || surcharge.PortOfLoading == request.PortOfLoading) &&
                    (surcharge.PortOfDischarge == null || surcharge.PortOfDischarge == request.PortOfDischarge) &&
                    (surcharge.Mode == null || surcharge.Mode == request.Mode) &&
                    (surcharge.EquipmentType == null || surcharge.EquipmentType == request.EquipmentType))
                .ToListAsync(cancellationToken);
        }

        private async Task<IReadOnlyCollection<QuoteSurcharge>> FindQuoteSurchargesAsync(QuoteRequest request, DateTime quoteDate, CancellationToken cancellationToken)
        {
            return await _dbContext.QuoteSurcharges
                .AsNoTracking()
                .Where(surcharge =>
                    surcharge.ValidFrom <= quoteDate &&
                    surcharge.ValidTo >= quoteDate &&
                    (surcharge.PortOfLoading == null || surcharge.PortOfLoading == request.PortOfLoading) &&
                    (surcharge.PortOfDischarge == null || surcharge.PortOfDischarge == request.PortOfDischarge) &&
                    (surcharge.Mode == null || surcharge.Mode == request.Mode) &&
                    (surcharge.EquipmentType == null || surcharge.EquipmentType == request.EquipmentType))
                .ToListAsync(cancellationToken);
        }

        private async Task<FreeTimeSummaryDto?> CalculateFreeTimeAsync(QuoteRequest request, CancellationToken cancellationToken)
        {
            FreeTimeCondition? condition = await _dbContext.FreeTimeConditions
                .AsNoTracking()
                .Include(item => item.DetentionTiers)
                .OrderByDescending(item => item.FreeDays)
                .FirstOrDefaultAsync(cancellationToken);

            if (condition == null)
            {
                return null;
            }

            decimal demurrageAmount = condition.CalculateDemurrage(request.DaysUsed);

            return new FreeTimeSummaryDto
            {
                FreeDays = condition.FreeDays,
                IsIncludedInOffer = condition.IsIncludedInOffer,
                AdditionalServiceAmount = condition.IsIncludedInOffer ? demurrageAmount : Math.Max(demurrageAmount, 0m),
                Currency = condition.Currency
            };
        }

        private async Task<QuoteDisclaimer?> FindActiveDisclaimerAsync(DateTime quoteDate, CancellationToken cancellationToken)
        {
            QuoteDisclaimer? disclaimer = await _dbContext.QuoteDisclaimers
                .AsNoTracking()
                .Where(item => item.IsActive)
                .OrderByDescending(item => item.ValidUntil)
                .FirstOrDefaultAsync(cancellationToken);

            if (disclaimer != null && disclaimer.ValidUntil.Date < quoteDate)
            {
                throw new InvalidOperationException("La cotizacion no puede emitirse porque el disclaimer legal esta vencido.");
            }

            return disclaimer;
        }

        private async Task<MarketReferenceData?> FindLatestMarketReferenceDataAsync(CancellationToken cancellationToken)
        {
            return await _dbContext.MarketReferenceData
                .AsNoTracking()
                .OrderByDescending(item => item.UpdatedAtUtc)
                .FirstOrDefaultAsync(cancellationToken);
        }

        private static QuoteLineItemDto CreateBaseFreightLine(QuoteRequest request, BaseOceanRate rate, decimal revenueTons)
        {
            decimal quantity = request.Mode == CargoMode.Fcl ? request.EquipmentQuantity : revenueTons;

            return CreateLine(
                "OFR",
                request.Mode == CargoMode.Fcl ? $"Ocean Freight {request.EquipmentType}" : "Ocean Freight LCL W/M",
                ChargeCategory.OceanFreight,
                request.Mode == CargoMode.Fcl ? CalculationBasis.PerContainer : CalculationBasis.PerRevenueTon,
                quantity,
                rate.Amount,
                ResolveCurrency(rate.CurrencyCode, rate.Currency),
                rate.BaseCurrency);
        }

        private static QuoteLineItemDto CreateLogisticChargeLine(QuoteRequest request, LogisticCharge charge, decimal revenueTons)
        {
            return CreateLine(
                charge.Code,
                charge.Description,
                charge.Category,
                charge.Basis,
                ResolveQuantity(request, charge.Basis, revenueTons),
                charge.Amount,
                ResolveCurrency(charge.CurrencyCode, charge.Currency),
                charge.BaseCurrency);
        }

        private static QuoteLineItemDto CreateDynamicSurchargeLine(QuoteRequest request, DynamicSurcharge surcharge, decimal revenueTons)
        {
            return CreateLine(
                surcharge.Code,
                surcharge.Description,
                ChargeCategory.Surcharge,
                surcharge.Basis,
                ResolveQuantity(request, surcharge.Basis, revenueTons),
                surcharge.Amount,
                ResolveCurrency(surcharge.CurrencyCode, surcharge.Currency),
                surcharge.BaseCurrency);
        }

        private static QuoteLineItemDto CreateQuoteSurchargeLine(QuoteRequest request, QuoteSurcharge surcharge, decimal revenueTons)
        {
            QuoteLineItemDto line = CreateLine(
                "QSC",
                surcharge.Name,
                ChargeCategory.Surcharge,
                ToCalculationBasis(surcharge.ChargeLevel),
                ResolveQuantity(request, surcharge.ChargeLevel, revenueTons),
                surcharge.Amount,
                ResolveCurrency(surcharge.CurrencyCode, surcharge.Currency),
                surcharge.BaseCurrency);

            line.ChargeLevel = surcharge.ChargeLevel;
            line.PaymentType = surcharge.PaymentType;
            line.IsFloating = surcharge.IsFloating;

            return line;
        }

        private static QuoteLineItemDto CreateLine(
            string code,
            string description,
            ChargeCategory category,
            CalculationBasis basis,
            decimal quantity,
            decimal unitBuyRate,
            string currency,
            string baseCurrency = DefaultBaseCurrency)
        {
            decimal buyAmount = quantity * unitBuyRate;
            string normalizedCurrency = NormalizeCurrency(currency);
            string normalizedBaseCurrency = NormalizeCurrency(baseCurrency);

            return new QuoteLineItemDto
            {
                Code = code,
                Description = description,
                Category = category,
                Basis = basis,
                Quantity = quantity,
                UnitBuyRate = unitBuyRate,
                BuyAmount = buyAmount,
                SellAmount = buyAmount,
                Currency = normalizedCurrency,
                OriginalCurrency = normalizedCurrency,
                OriginalBuyAmount = buyAmount,
                OriginalSellAmount = buyAmount,
                BaseCurrency = normalizedBaseCurrency
            };
        }

        private static decimal ResolveQuantity(QuoteRequest request, CalculationBasis basis, decimal revenueTons)
        {
            return basis switch
            {
                CalculationBasis.PerContainer => request.Mode == CargoMode.Fcl ? request.EquipmentQuantity : 1m,
                CalculationBasis.PerRevenueTon => revenueTons,
                _ => 1m
            };
        }

        private static decimal ResolveQuantity(QuoteRequest request, ChargeLevel chargeLevel, decimal revenueTons)
        {
            return chargeLevel switch
            {
                ChargeLevel.PerEquipment => request.Mode == CargoMode.Fcl ? request.EquipmentQuantity : 1m,
                ChargeLevel.PerBillOfLading => 1m,
                ChargeLevel.PerTon => revenueTons,
                ChargeLevel.PerContainer => request.Mode == CargoMode.Fcl ? request.EquipmentQuantity : 1m,
                _ => 1m
            };
        }

        private static CalculationBasis ToCalculationBasis(ChargeLevel chargeLevel)
        {
            return chargeLevel switch
            {
                ChargeLevel.PerEquipment => CalculationBasis.PerContainer,
                ChargeLevel.PerBillOfLading => CalculationBasis.PerShipment,
                ChargeLevel.PerTon => CalculationBasis.PerRevenueTon,
                ChargeLevel.PerContainer => CalculationBasis.PerContainer,
                _ => CalculationBasis.PerShipment
            };
        }

        private static IReadOnlyCollection<SurchargeGroupDto> GroupSurchargesByChargeLevel(IEnumerable<QuoteLineItemDto> lineItems)
        {
            return lineItems
                .Where(item => item.Category == ChargeCategory.Surcharge && item.ChargeLevel.HasValue)
                .GroupBy(item => new { ChargeLevel = item.ChargeLevel!.Value, item.Currency })
                .Select(group => new SurchargeGroupDto
                {
                    ChargeLevel = group.Key.ChargeLevel,
                    Currency = group.Key.Currency,
                    TotalAmount = group.Sum(item => item.SellAmount)
                })
                .ToList();
        }

        private static void ApplyMargins(ICollection<QuoteLineItemDto> lineItems, IReadOnlyCollection<MarginPolicy> marginPolicies)
        {
            foreach (QuoteLineItemDto item in lineItems)
            {
                MarginPolicy? policy = marginPolicies.FirstOrDefault(policy => policy.Category == item.Category);

                if (policy == null)
                {
                    item.SellAmount = item.BuyAmount;
                    continue;
                }

                item.MarkupPercent = policy.MarkupPercent;
                item.FlatFee = policy.FlatFee;
                item.SellAmount = item.BuyAmount + (item.BuyAmount * policy.MarkupPercent / 100m) + policy.FlatFee;
                item.OriginalSellAmount = item.SellAmount;
            }
        }

        private static ChargeCategory ResolveSalesMarginCategory(QuoteSurcharge cost)
        {
            string name = cost.Name.ToLowerInvariant();

            if (name.Contains("ocean") || name.Contains("freight") || name == "ofr")
            {
                return ChargeCategory.OceanFreight;
            }

            if (name.Contains("fob") || name.Contains("local") || name.Contains("thc") || name.Contains("custom"))
            {
                return cost.PortOfDischarge == null ? ChargeCategory.LocalOrigin : ChargeCategory.LocalDestination;
            }

            return ChargeCategory.Surcharge;
        }

        private static bool IsOriginCostIncluded(Incoterm incoterm)
        {
            return incoterm == Incoterm.Exw || incoterm == Incoterm.Fca || incoterm == Incoterm.Fas;
        }

        private static bool IsDestinationCostIncluded(Incoterm incoterm)
        {
            return incoterm == Incoterm.Dap || incoterm == Incoterm.Dpu || incoterm == Incoterm.Ddp;
        }

        private static bool IsChargeIncludedByIncoterm(ChargeCategory category, Incoterm incoterm)
        {
            return category switch
            {
                ChargeCategory.LocalOrigin => IsOriginCostIncluded(incoterm),
                ChargeCategory.LocalDestination => IsDestinationCostIncluded(incoterm),
                _ => true
            };
        }

        private void ApplyCurrencyConversion(IEnumerable<QuoteLineItemDto> lineItems, string baseCurrency)
        {
            foreach (QuoteLineItemDto item in lineItems)
            {
                item.OriginalCurrency = NormalizeCurrency(item.OriginalCurrency);
                item.BaseCurrency = baseCurrency;
                item.ExchangeRate = ResolveExchangeRate(item.OriginalCurrency, baseCurrency);
                item.BuyAmount = ConvertAmount(item.OriginalBuyAmount, item.OriginalCurrency, baseCurrency);
                item.SellAmount = ConvertAmount(item.OriginalSellAmount, item.OriginalCurrency, baseCurrency);
                item.Currency = baseCurrency;
            }
        }

        public decimal ConvertAmount(decimal amount, string fromCurrency, string toCurrency)
        {
            return Math.Round(amount * ResolveExchangeRate(fromCurrency, toCurrency), 2, MidpointRounding.AwayFromZero);
        }

        private decimal ResolveExchangeRate(string fromCurrency, string toCurrency)
        {
            string from = NormalizeCurrency(fromCurrency);
            string to = NormalizeCurrency(toCurrency);

            if (from == to)
            {
                return 1m;
            }

            if (_currentMarketReferenceData?.EurUsdRate <= 0m)
            {
                throw new InvalidOperationException($"No existe tasa EUR/USD vigente en MarketReferenceData para convertir {from} a {to}.");
            }

            decimal eurUsdRate = _currentMarketReferenceData.EurUsdRate;

            return (from, to) switch
            {
                ("EUR", "USD") => eurUsdRate,
                ("USD", "EUR") => Math.Round(1m / eurUsdRate, 6, MidpointRounding.AwayFromZero),
                _ => throw new InvalidOperationException($"No existe tasa de cambio vigente para convertir {from} a {to}.")
            };
        }

        private static IReadOnlyCollection<CurrencyBreakdownDto> GroupOriginalCurrencyBreakdown(IEnumerable<QuoteLineItemDto> lineItems)
        {
            return lineItems
                .GroupBy(item => item.OriginalCurrency)
                .Select(group => new CurrencyBreakdownDto
                {
                    Currency = group.Key,
                    TotalBuyAmount = group.Sum(item => item.OriginalBuyAmount),
                    TotalSellAmount = group.Sum(item => item.OriginalSellAmount)
                })
                .ToList();
        }

        private static string ResolveCurrency(string? currencyCode, string? currency)
        {
            return NormalizeCurrency(string.IsNullOrWhiteSpace(currencyCode) ? currency : currencyCode);
        }

        private static string NormalizeCurrency(string? currency)
        {
            return string.IsNullOrWhiteSpace(currency) ? "USD" : currency.Trim().ToUpperInvariant();
        }

        private static string NormalizeContainerType(string containerType)
        {
            string normalized = containerType.Trim().ToUpperInvariant()
                .Replace("'", string.Empty)
                .Replace(" ", string.Empty)
                .Replace("-", string.Empty)
                .Replace("_", string.Empty);

            return normalized switch
            {
                "20" or "20ST" or "20STD" or "20STANDARD" or "20DV" => "20ST",
                "40" or "40ST" or "40STD" or "40STANDARD" or "40DV" => "40ST",
                "40HC" or "40HQ" or "40HIGHCUBE" => "40HC",
                "REEFER" or "RF" or "40RF" or "40REEFER" => "REEFER",
                "FLATRACK" or "20FLATRACK" or "FR" or "20FR" => "FLAT_RACK",
                "OPENTOP" or "20OPENTOP" or "OT" or "20OT" => "OPEN_TOP",
                _ => containerType.Trim().ToUpperInvariant()
            };
        }

        private static List<SelectedEquipment> ResolveSelectedEquipment(QuoteRequest request)
        {
            if (request.SelectedEquipment?.Count > 0)
            {
                return request.SelectedEquipment
                    .Where(item => item.Quantity > 0 && !string.IsNullOrWhiteSpace(item.ContainerType))
                    .Select(item => new SelectedEquipment
                    {
                        Id = item.Id,
                        ContainerType = NormalizeContainerType(item.ContainerType),
                        Quantity = item.Quantity
                    })
                    .ToList();
            }

            return new List<SelectedEquipment>
            {
                new SelectedEquipment
                {
                    ContainerType = NormalizeContainerType(request.EquipmentType ?? string.Empty),
                    Quantity = request.EquipmentQuantity
                }
            };
        }

        private static bool IsEquipmentLevel(ChargeLevel chargeLevel)
        {
            return chargeLevel == ChargeLevel.PerEquipment || chargeLevel == ChargeLevel.PerContainer;
        }

        private static bool IsLinkedToSelectedEquipment(Surcharge surcharge, SelectedEquipment equipment, string normalizedContainerType)
        {
            if (!string.IsNullOrWhiteSpace(surcharge.LinkedEquipmentId))
            {
                return string.Equals(surcharge.LinkedEquipmentId, equipment.Id, StringComparison.OrdinalIgnoreCase);
            }

            return surcharge.ContainerType == normalizedContainerType;
        }

        private static string ResolveSurchargeContainerType(Surcharge surcharge)
        {
            if (!string.IsNullOrWhiteSpace(surcharge.ContainerType))
            {
                return NormalizeContainerType(surcharge.ContainerType);
            }

            return ExtractContainerTypeFromConcept(surcharge.Concept);
        }

        private static string ExtractContainerTypeFromConcept(string concept)
        {
            string normalized = concept.Trim().ToUpperInvariant()
                .Replace("\"", string.Empty)
                .Replace("'", string.Empty)
                .Replace("-", string.Empty)
                .Replace("_", string.Empty);

            if (normalized.Contains("40HC") || normalized.Contains("40HQ") || normalized.Contains("40 HIGH CUBE"))
            {
                return "40HC";
            }

            if (normalized.Contains("40STD") || normalized.Contains("40DV") || normalized.Contains("40 STANDARD") || normalized.Contains("40 ST"))
            {
                return "40ST";
            }

            if (normalized.Contains("20STD") || normalized.Contains("20DV") || normalized.Contains("20 STANDARD") || normalized.Contains("20 ST"))
            {
                return "20ST";
            }

            if (normalized.Contains("REEFER") || normalized.Contains("40RF") || normalized.Contains("20RF"))
            {
                return "REEFER";
            }

            if (normalized.Contains("FLAT RACK") || normalized.Contains("FLATRACK"))
            {
                return "FLAT_RACK";
            }

            if (normalized.Contains("OPEN TOP") || normalized.Contains("OPENTOP"))
            {
                return "OPEN_TOP";
            }

            return string.Empty;
        }

        private static string FormatContainerType(string containerType)
        {
            return containerType switch
            {
                "20ST" => "20'STD",
                "40ST" => "40'STD",
                "40HC" => "40'HC",
                "FLAT_RACK" => "Flat Rack",
                "OPEN_TOP" => "Open Top",
                _ => containerType
            };
        }

        private static void ValidateRequest(QuoteRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.PortOfLoading))
            {
                throw new ArgumentException("El puerto de carga es obligatorio.", nameof(request));
            }

            if (string.IsNullOrWhiteSpace(request.PortOfDischarge))
            {
                throw new ArgumentException("El puerto de descarga es obligatorio.", nameof(request));
            }

            bool hasSelectedEquipment = request.SelectedEquipment?.Any(item =>
                item.Quantity > 0 && !string.IsNullOrWhiteSpace(item.ContainerType)) == true;

            if (request.Mode == CargoMode.Fcl && string.IsNullOrWhiteSpace(request.EquipmentType) && !hasSelectedEquipment)
            {
                throw new ArgumentException("El tipo de equipo es obligatorio para cotizaciones FCL.", nameof(request));
            }

            if (request.Mode == CargoMode.Fcl && request.EquipmentQuantity <= 0 && !hasSelectedEquipment)
            {
                throw new ArgumentException("La cantidad de equipos debe ser mayor que cero.", nameof(request));
            }

            if (request.Mode == CargoMode.Lcl && request.WeightInTons <= 0m && request.VolumeInCbm <= 0m)
            {
                throw new ArgumentException("Para LCL se requiere peso o volumen mayor que cero.", nameof(request));
            }
        }
    }
}
