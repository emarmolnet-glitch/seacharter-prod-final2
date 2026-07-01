namespace SeaCharter.DTOs.Pricing
{
    /// <summary>
    /// Total por moneda original para mostrar el desglose auditable junto al total consolidado.
    /// </summary>
    public class CurrencyBreakdownDto
    {
        public string Currency { get; set; } = "USD";

        public decimal TotalBuyAmount { get; set; }

        public decimal TotalSellAmount { get; set; }
    }
}
