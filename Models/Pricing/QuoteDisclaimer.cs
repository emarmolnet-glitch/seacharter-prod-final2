using System;
using System.ComponentModel.DataAnnotations;

namespace SeaCharter.Models.Pricing
{
    /// <summary>
    /// Texto legal asociado a una cotizacion naviera.
    /// ValidUntil permite invalidar automaticamente ofertas vencidas antes de emitirlas al cliente.
    /// </summary>
    public class QuoteDisclaimer
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public string LegalText { get; set; } = string.Empty;

        public DateTime ValidUntil { get; set; }

        public bool IsActive { get; set; } = true;
    }
}
