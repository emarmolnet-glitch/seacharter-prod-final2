using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SeaCharter.Models.Demurrage
{
    /// <summary>
    /// Tramo diario usado por FreeTimeCondition para reproducir el escalado de detention de las navieras.
    /// </summary>
    public class Tier
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int FreeTimeConditionId { get; set; }

        [Range(1, int.MaxValue)]
        public int StartDay { get; set; }

        [Range(1, int.MaxValue)]
        public int? EndDay { get; set; }

        [Column(TypeName = "decimal(18,2)")]
        [Range(typeof(decimal), "0", "9999999999999999")]
        public decimal DailyRate { get; set; }

        public virtual FreeTimeCondition? FreeTimeCondition { get; set; }
    }
}
