using SeaCharter.Models.Pricing;

namespace SeaCharter.DTOs.Pricing
{
    /// <summary>
    /// Total agrupado por nivel de recargo para auditar la cotizacion como una hoja naviera real.
    /// </summary>
    public class SurchargeGroupDto
    {
        public ChargeLevel ChargeLevel { get; set; }

        public decimal TotalAmount { get; set; }

        public string Currency { get; set; } = "USD";
    }
}
