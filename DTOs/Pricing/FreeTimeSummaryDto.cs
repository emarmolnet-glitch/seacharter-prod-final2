namespace SeaCharter.DTOs.Pricing
{
    /// <summary>
    /// Resumen operativo de free time y demurrage/detention aplicado por el motor.
    /// </summary>
    public class FreeTimeSummaryDto
    {
        public int FreeDays { get; set; }

        public bool IsIncludedInOffer { get; set; }

        public decimal AdditionalServiceAmount { get; set; }

        public string Currency { get; set; } = "USD";
    }
}
