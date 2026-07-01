using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using SeaCharter.Models.Pricing;

namespace SeaCharter.DTOs.Pricing
{
    /// <summary>
    /// Solicitud de cotizacion recibida por SeaCharter Data Bridge.
    /// </summary>
    public class QuoteRequest
    {
        [Required]
        [MaxLength(10)]
        public string PortOfLoading { get; set; } = string.Empty;

        [Required]
        [MaxLength(10)]
        public string PortOfDischarge { get; set; } = string.Empty;

        public DateTime ValidityDate { get; set; } = DateTime.UtcNow.Date;

        public CargoMode Mode { get; set; }

        [MaxLength(20)]
        public string? EquipmentType { get; set; }

        [Range(1, 999)]
        public int EquipmentQuantity { get; set; } = 1;

        public List<SelectedEquipment> SelectedEquipment { get; set; } = new List<SelectedEquipment>();

        [Range(typeof(decimal), "0", "9999999999999999")]
        public decimal WeightInTons { get; set; }

        [Range(typeof(decimal), "0", "9999999999999999")]
        public decimal VolumeInCbm { get; set; }

        public bool IsImo { get; set; }

        public bool IsReefer { get; set; }

        public Incoterm Incoterm { get; set; }

        public int DaysUsed { get; set; }
    }
}
