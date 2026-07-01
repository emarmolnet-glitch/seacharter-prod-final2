using System;
using System.Collections.Generic;
using SeaCharter.Models.Pricing;

namespace SeaCharter.DTOs.Pricing
{
    /// <summary>
    /// Resultado de cotizacion con totales de compra, venta y desglose auditable.
    /// </summary>
    public class QuoteResponse
    {
        public string QuoteNumber { get; set; } = string.Empty;

        public string PortOfLoading { get; set; } = string.Empty;

        public string PortOfDischarge { get; set; } = string.Empty;

        public DateTime ValidityDate { get; set; }

        public CargoMode Mode { get; set; }

        public Incoterm Incoterm { get; set; }

        public decimal RevenueTons { get; set; }

        public decimal TotalBuyRate { get; set; }

        public decimal TotalSellRate { get; set; }

        public decimal GrossProfit => TotalSellRate - TotalBuyRate;

        public string Currency { get; set; } = "USD";

        public string BaseCurrency { get; set; } = "EUR";

        public decimal TotalBuyRateBase { get; set; }

        public decimal TotalSellRateBase { get; set; }

        public IReadOnlyCollection<CurrencyBreakdownDto> CurrencyBreakdown { get; set; } = Array.Empty<CurrencyBreakdownDto>();

        public IReadOnlyCollection<QuoteLineItemDto> LineItems { get; set; } = Array.Empty<QuoteLineItemDto>();

        public IReadOnlyCollection<SurchargeGroupDto> SurchargeGroups { get; set; } = Array.Empty<SurchargeGroupDto>();

        public QuoteBreakdown? BreakdownByEquipment { get; set; }

        public FreeTimeSummaryDto? FreeTime { get; set; }

        public string LegalDisclaimer { get; set; } = string.Empty;

        public DateTime? DisclaimerValidUntil { get; set; }
    }
}
