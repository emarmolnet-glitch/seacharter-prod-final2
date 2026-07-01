namespace SeaCharter.DTOs.Pricing
{
    public class QuoteBreakdownLineItem
    {
        public string Label { get; set; } = string.Empty;

        public string? ContainerType { get; set; }

        public int Quantity { get; set; }

        public decimal UnitAmount { get; set; }

        public decimal TotalAmount { get; set; }

        public string Currency { get; set; } = "USD";

        public bool IsGeneralCharge { get; set; }
    }
}
