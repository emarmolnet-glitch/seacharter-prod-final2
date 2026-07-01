using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SeaCharter.Models.Pricing
{
    /// <summary>
    /// Recargo temporal vigente: PSS, GRI, BAF u otros conceptos variables.
    /// </summary>
    public class DynamicSurcharge
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(30)]
        public string Code { get; set; } = string.Empty;

        [Required]
        [MaxLength(150)]
        public string Description { get; set; } = string.Empty;

        [MaxLength(10)]
        public string? PortOfLoading { get; set; }

        [MaxLength(10)]
        public string? PortOfDischarge { get; set; }

        public CargoMode? Mode { get; set; }

        [MaxLength(20)]
        public string? EquipmentType { get; set; }

        public CalculationBasis Basis { get; set; } = CalculationBasis.PerShipment;

        public DateTime ValidFrom { get; set; }

        public DateTime ValidTo { get; set; }

        [Column(TypeName = "decimal(18,2)")]
        public decimal Amount { get; set; }

        [Required]
        [MaxLength(3)]
        public string Currency { get; set; } = "USD";

        [Required]
        [MaxLength(3)]
        public string CurrencyCode { get; set; } = "USD";

        [Required]
        [MaxLength(3)]
        public string BaseCurrency { get; set; } = "EUR";
    }
}
