using SeaCharter.Models.Pricing;

namespace SeaCharter.DTOs.Pricing
{
    /// <summary>
    /// Linea de desglose de costes y venta calculada por el motor.
    /// </summary>
    public class QuoteLineItemDto
    {
        public string Code { get; set; } = string.Empty;

        public string Description { get; set; } = string.Empty;

        public ChargeCategory Category { get; set; }

        public CalculationBasis Basis { get; set; }

        public ChargeLevel? ChargeLevel { get; set; }

        public PaymentType? PaymentType { get; set; }

        public bool IsFloating { get; set; }

        public decimal Quantity { get; set; }

        public decimal UnitBuyRate { get; set; }

        public decimal BuyAmount { get; set; }

        public decimal MarkupPercent { get; set; }

        public decimal FlatFee { get; set; }

        public decimal SellAmount { get; set; }

        public string Currency { get; set; } = "USD";

        public string OriginalCurrency { get; set; } = "USD";

        public decimal OriginalBuyAmount { get; set; }

        public decimal OriginalSellAmount { get; set; }

        public string BaseCurrency { get; set; } = "EUR";

        public decimal ExchangeRate { get; set; } = 1m;
    }
}
