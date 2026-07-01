using System;
using System.ComponentModel.DataAnnotations;

namespace SeaCharter.Models.Lcl
{
    // Master table for each concept imported from the "FOB EXPENSES" Excel sheet.
    public class FobExpenseTemplate
    {
        [Key]
        public int Id { get; set; }

        // Excel concept column: "HANDLING", "DOCUMENTS", "CUSTOMS CLEAREANCE", etc.
        [Required]
        [MaxLength(100)]
        public string ConceptName { get; set; } = string.Empty;

        // Excel "Tone" column. Nullable for manual/official-rate concepts.
        public decimal? RatePerTon { get; set; }

        // Excel "m3" column. Nullable for fixed shipment concepts.
        public decimal? RatePerCbm { get; set; }

        // Final notes/rules column from the Excel source.
        public string ApplicationRule { get; set; } = string.Empty;

        // Business flags consumed by the quotation engine.
        public bool IsWeightMeasureCalculation { get; set; }

        public bool IsFixedPerShipment { get; set; }

        public bool RequiresManualRate { get; set; }

        public DateTime LastUpdated { get; set; } = DateTime.UtcNow;
    }
}
