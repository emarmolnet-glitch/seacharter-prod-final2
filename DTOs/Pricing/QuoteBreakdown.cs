using System;
using System.Collections.Generic;

namespace SeaCharter.DTOs.Pricing
{
    /// <summary>
    /// Desglose de una cotizacion agrupada por tipo de contenedor y cargos generales.
    /// </summary>
    public class QuoteBreakdown
    {
        public decimal TotalAmount { get; set; }

        public string Currency { get; set; } = "USD";

        public IReadOnlyCollection<QuoteBreakdownLineItem> Lines { get; set; } = Array.Empty<QuoteBreakdownLineItem>();
    }
}
