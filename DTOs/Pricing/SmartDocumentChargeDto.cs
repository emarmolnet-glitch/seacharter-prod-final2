using SeaCharter.Models.Pricing;

namespace SeaCharter.DTOs.Pricing
{
    /// <summary>
    /// Coste extraido semanticamente desde una oferta PDF o Excel de naviera.
    /// </summary>
    public class SmartDocumentChargeDto
    {
        public string Concept { get; set; } = string.Empty;

        public decimal Amount { get; set; }

        public string Currency { get; set; } = "USD";

        public ChargeLevel ChargeLevel { get; set; } = ChargeLevel.PerContainer;
    }
}
