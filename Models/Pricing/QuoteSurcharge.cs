using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SeaCharter.Models.Pricing
{
    /// <summary>
    /// Recargo avanzado copiado del formato operativo de una quote sheet naviera.
    /// Conserva nivel de cobro, tipo de pago y naturaleza flotante para explicar cada euro cotizado.
    /// </summary>
    public class QuoteSurcharge
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(150)]
        public string Name { get; set; } = string.Empty;

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

        public ChargeLevel ChargeLevel { get; set; } = ChargeLevel.PerContainer;

        public PaymentType PaymentType { get; set; } = PaymentType.Prepaid;

        public bool IsFloating { get; set; }

        [MaxLength(10)]
        public string? PortOfLoading { get; set; }

        [MaxLength(10)]
        public string? PortOfDischarge { get; set; }

        public CargoMode? Mode { get; set; }

        [MaxLength(20)]
        public string? EquipmentType { get; set; }

        public DateTime ValidFrom { get; set; }

        public DateTime ValidTo { get; set; }
    }
}
