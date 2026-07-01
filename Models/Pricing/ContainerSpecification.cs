using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SeaCharter.Models.Pricing
{
    /// <summary>
    /// Especificacion tecnica de equipo para validaciones de capacidad FCL.
    /// Las capacidades utilizables aplican un factor operativo para evitar saturacion.
    /// </summary>
    public class ContainerSpecification
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(40)]
        public string ContainerType { get; set; } = string.Empty;

        [Required]
        [MaxLength(120)]
        public string DisplayName { get; set; } = string.Empty;

        [Column(TypeName = "decimal(8,2)")]
        public decimal InternalLengthMeters { get; set; }

        [Column(TypeName = "decimal(8,2)")]
        public decimal InternalWidthMeters { get; set; }

        [Column(TypeName = "decimal(8,2)")]
        public decimal InternalHeightMeters { get; set; }

        [Column(TypeName = "decimal(10,2)")]
        public decimal MaximumVolumeCbm { get; set; }

        [Column(TypeName = "decimal(10,2)")]
        public decimal MaximumPayloadKg { get; set; }

        [Column(TypeName = "decimal(5,2)")]
        public decimal UtilizationFactor { get; set; } = 0.90m;

        [Column(TypeName = "decimal(10,2)")]
        public decimal UsableVolumeCbm { get; set; }

        [Column(TypeName = "decimal(10,2)")]
        public decimal UsablePayloadKg { get; set; }

        [MaxLength(250)]
        public string SourceNote { get; set; } = string.Empty;
    }
}
