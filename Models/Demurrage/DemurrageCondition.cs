using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;

namespace SeaCharter.Models.Demurrage
{
    /// <summary>
    /// Condicion maestra de demoras y detenciones negociada con una naviera.
    /// Define los dias libres y sus tramos tarifarios escalonados.
    /// </summary>
    public class DemurrageCondition
    {
        [Key]
        public int Id { get; set; }

        /// <summary>
        /// Nombre comercial de la naviera. Ejemplos: MSC, Maersk, CMA CGM.
        /// </summary>
        [Required]
        [MaxLength(100)]
        public string ShippingLineName { get; set; } = string.Empty;

        /// <summary>
        /// Tipo ISO/comercial del contenedor. Ejemplos: 20DV, 40DV, 40HC.
        /// </summary>
        [Required]
        [MaxLength(20)]
        public string ContainerType { get; set; } = string.Empty;

        /// <summary>
        /// Dias libres concedidos antes de iniciar el cobro de penalizaciones.
        /// </summary>
        [Range(0, 365, ErrorMessage = "Los dias libres deben estar entre 0 y 365.")]
        public int FreeDays { get; set; }

        /// <summary>
        /// Indica si la condicion corresponde a demora en terminal o detencion fuera de terminal.
        /// </summary>
        [Required]
        public DemurrageChargeType Type { get; set; }

        /// <summary>
        /// Tramos escalonados asociados a esta condicion.
        /// </summary>
        public virtual ICollection<DemurrageTier> Tiers { get; set; } = new List<DemurrageTier>();

        /// <summary>
        /// Calcula la penalizacion total segun los dias reales de inmovilizacion del contenedor.
        /// Los tramos se interpretan como dias absolutos de uso total, no como dias relativos al exceso.
        /// Ejemplo: con FreeDays = 14, un tramo StartDay = 15 y EndDay = 20 cobra los dias 15 al 20.
        /// </summary>
        /// <param name="totalDaysUsed">Total de dias que el contenedor estuvo inmovilizado.</param>
        /// <returns>Importe total de penalizacion.</returns>
        /// <exception cref="ArgumentOutOfRangeException">
        /// Se lanza cuando totalDaysUsed es negativo.
        /// </exception>
        /// <exception cref="InvalidOperationException">
        /// Se lanza cuando algun tramo tiene una configuracion incoherente.
        /// </exception>
        public decimal CalculatePenalty(int totalDaysUsed)
        {
            if (totalDaysUsed < 0)
            {
                throw new ArgumentOutOfRangeException(nameof(totalDaysUsed), "Los dias utilizados no pueden ser negativos.");
            }

            if (totalDaysUsed <= FreeDays || Tiers.Count == 0)
            {
                return 0m;
            }

            decimal totalPenalty = 0m;
            int firstChargeableDay = FreeDays + 1;
            int lastUsedDay = totalDaysUsed;

            foreach (DemurrageTier tier in Tiers.OrderBy(tier => tier.StartDay))
            {
                ValidateTier(tier);

                int tierEndDay = tier.EndDay ?? int.MaxValue;
                int chargeStartDay = Math.Max(firstChargeableDay, tier.StartDay);
                int chargeEndDay = Math.Min(lastUsedDay, tierEndDay);

                if (chargeEndDay < chargeStartDay)
                {
                    continue;
                }

                int chargeableDaysInTier = chargeEndDay - chargeStartDay + 1;
                totalPenalty += chargeableDaysInTier * tier.DailyRate;
            }

            return totalPenalty;
        }

        private static void ValidateTier(DemurrageTier tier)
        {
            if (tier.StartDay <= 0)
            {
                throw new InvalidOperationException("El dia de inicio del tramo debe ser mayor que cero.");
            }

            if (tier.EndDay.HasValue && tier.EndDay.Value < tier.StartDay)
            {
                throw new InvalidOperationException("El dia de fin del tramo no puede ser menor que el dia de inicio.");
            }

            if (tier.DailyRate < 0m)
            {
                throw new InvalidOperationException("La tarifa diaria del tramo no puede ser negativa.");
            }
        }
    }
}
