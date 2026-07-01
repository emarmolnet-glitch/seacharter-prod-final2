using System.ComponentModel.DataAnnotations;

namespace SeaCharter.DTOs.Pricing
{
    /// <summary>
    /// Equipo elegido por el usuario para calcular una cotizacion FCL mixta.
    /// </summary>
    public class SelectedEquipment
    {
        [MaxLength(40)]
        public string? Id { get; set; }

        [Required]
        [MaxLength(40)]
        public string ContainerType { get; set; } = string.Empty;

        [Range(1, 999)]
        public int Quantity { get; set; } = 1;
    }
}
