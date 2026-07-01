using System.ComponentModel.DataAnnotations;
using SeaCharter.Models.Pricing;

namespace SeaCharter.DTOs.Pricing
{
    /// <summary>
    /// Coste normalizado extraido de una oferta de naviera antes de calcular totales por equipo.
    /// </summary>
    public class Surcharge
    {
        [Required]
        [MaxLength(150)]
        public string Concept { get; set; } = string.Empty;

        public decimal Amount { get; set; }

        [MaxLength(3)]
        public string Currency { get; set; } = "USD";

        public ChargeLevel ChargeLevel { get; set; } = ChargeLevel.PerContainer;

        [MaxLength(40)]
        public string? ContainerType { get; set; }

        [MaxLength(40)]
        public string? LinkedEquipmentId { get; set; }

        public ChargeCategory Category { get; set; } = ChargeCategory.Surcharge;
    }
}
