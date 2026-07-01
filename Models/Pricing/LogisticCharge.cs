using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SeaCharter.Models.Pricing
{
    /// <summary>
    /// Gasto logistico aplicable por origen, destino, ruta o naturaleza de mercancia.
    /// </summary>
    public class LogisticCharge
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(80)]
        public string Code { get; set; } = string.Empty;

        [Required]
        [MaxLength(150)]
        public string Description { get; set; } = string.Empty;

        public ChargeCategory Category { get; set; }

        public LocalChargeSide? Side { get; set; }

        public CalculationBasis Basis { get; set; } = CalculationBasis.PerShipment;

        [MaxLength(10)]
        public string? PortOfLoading { get; set; }

        [MaxLength(10)]
        public string? PortOfDischarge { get; set; }

        public bool AppliesToImo { get; set; }

        public bool AppliesToReefer { get; set; }

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
