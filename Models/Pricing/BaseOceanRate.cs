using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SeaCharter.Models.Pricing
{
    /// <summary>
    /// Tarifa maestra de flete por ruta, fecha y modalidad.
    /// </summary>
    public class BaseOceanRate
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(10)]
        public string PortOfLoading { get; set; } = string.Empty;

        [Required]
        [MaxLength(10)]
        public string PortOfDischarge { get; set; } = string.Empty;

        public CargoMode Mode { get; set; }

        [MaxLength(20)]
        public string? EquipmentType { get; set; }

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
