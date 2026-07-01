using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SeaCharter.Models.Demurrage
{
    /// <summary>
    /// Tramo tarifario aplicable a una condicion de demoras o detenciones.
    /// </summary>
    public class DemurrageTier
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int DemurrageConditionId { get; set; }

        /// <summary>
        /// Dia absoluto de inicio del tramo. Ejemplo: 15 si los dias 1 al 14 son libres.
        /// </summary>
        [Range(1, int.MaxValue, ErrorMessage = "El dia de inicio debe ser mayor que cero.")]
        public int StartDay { get; set; }

        /// <summary>
        /// Dia absoluto de fin del tramo. Si es null, el tramo aplica desde StartDay en adelante.
        /// </summary>
        [Range(1, int.MaxValue, ErrorMessage = "El dia de fin debe ser mayor que cero.")]
        public int? EndDay { get; set; }

        /// <summary>
        /// Tarifa diaria aplicable dentro del tramo.
        /// </summary>
        [Column(TypeName = "decimal(18,2)")]
        [Range(typeof(decimal), "0", "9999999999999999", ErrorMessage = "La tarifa diaria no puede ser negativa.")]
        public decimal DailyRate { get; set; }

        [ForeignKey(nameof(DemurrageConditionId))]
        public virtual DemurrageCondition? DemurrageCondition { get; set; }
    }
}
