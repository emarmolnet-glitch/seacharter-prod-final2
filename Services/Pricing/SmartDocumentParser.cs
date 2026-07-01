using System;
using System.Collections.Generic;
using System.Linq;
using SeaCharter.DTOs.Pricing;
using SeaCharter.Models.Pricing;

namespace SeaCharter.Services.Pricing
{
    /// <summary>
    /// Normaliza la salida semantica del LLM hacia QuoteSurcharge para mantener trazabilidad operativa.
    /// La llamada real al modelo se ejecuta en la funcion Netlify audit-carrier-offer mediante AI Gateway.
    /// </summary>
    public class SmartDocumentParser
    {
        public IReadOnlyCollection<QuoteSurcharge> MapToQuoteSurcharges(
            IEnumerable<SmartDocumentChargeDto> extractedCharges,
            string? portOfLoading,
            string? portOfDischarge,
            CargoMode mode,
            string? equipmentType,
            DateTime validFrom,
            DateTime validTo)
        {
            return extractedCharges
                .Where(charge => !string.IsNullOrWhiteSpace(charge.Concept))
                .Select(charge => new QuoteSurcharge
                {
                    Name = charge.Concept.Trim(),
                    Amount = charge.Amount,
                    Currency = NormalizeCurrency(charge.Currency),
                    CurrencyCode = NormalizeCurrency(charge.Currency),
                    BaseCurrency = "EUR",
                    ChargeLevel = charge.ChargeLevel,
                    PaymentType = PaymentType.Prepaid,
                    IsFloating = false,
                    PortOfLoading = portOfLoading,
                    PortOfDischarge = portOfDischarge,
                    Mode = mode,
                    EquipmentType = equipmentType,
                    ValidFrom = validFrom,
                    ValidTo = validTo
                })
                .ToList();
        }

        public decimal CalculateProposedSellPrice(QuoteSurcharge surcharge, decimal markupPercentage, decimal markupFixedFee)
        {
            if (IsOceanFreight(surcharge.Name))
            {
                return surcharge.Amount + (surcharge.Amount * markupPercentage / 100m);
            }

            if (IsFobOrLocal(surcharge.Name))
            {
                return surcharge.Amount + markupFixedFee;
            }

            return surcharge.Amount;
        }

        private static bool IsOceanFreight(string concept)
        {
            string normalized = concept.Trim().ToLowerInvariant();
            return normalized.Contains("ocean freight") || normalized.Contains("freight") || normalized == "ofr";
        }

        private static bool IsFobOrLocal(string concept)
        {
            string normalized = concept.Trim().ToLowerInvariant();
            return normalized.Contains("fob") ||
                   normalized.Contains("local") ||
                   normalized.Contains("thc") ||
                   normalized.Contains("custom");
        }

        private static string NormalizeCurrency(string? currency)
        {
            return string.IsNullOrWhiteSpace(currency) ? "USD" : currency.Trim().ToUpperInvariant();
        }
    }
}
