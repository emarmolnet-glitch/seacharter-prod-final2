using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SeaCharter.Models.Pricing
{
    /// <summary>
    /// Politica de margen aplicada al transformar coste de compra en venta.
    /// </summary>
    public class MarginPolicy
    {
        [Key]
        public int Id { get; set; }

        public ChargeCategory Category { get; set; }

        [Column(TypeName = "decimal(9,4)")]
        public decimal MarkupPercent { get; set; }

        [Column(TypeName = "decimal(18,2)")]
        public decimal FlatFee { get; set; }

        public bool IsActive { get; set; } = true;
    }
}
