using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;

namespace SeaCharter.Models.Demurrage
{
    /// <summary>
    /// Condicion de free time de una oferta FCL/LCL.
    /// Replica la estructura de una hoja de cotizacion real para separar dias libres incluidos y detention escalonada.
    /// </summary>
    public class FreeTimeCondition
    {
        [Key]
        public int Id { get; set; }

        [Range(0, 365)]
        public int FreeDays { get; set; }

        public bool IsIncludedInOffer { get; set; } = true;

        [MaxLength(3)]
        public string Currency { get; set; } = "USD";

        public virtual ICollection<Tier> DetentionTiers { get; set; } = new List<Tier>();

        /// <summary>
        /// Calcula la demora/detention total aplicando tramos escalonados despues de los dias libres.
        /// Los tramos usan dias absolutos de uso, igual que en las instrucciones operativas de navieras.
        /// </summary>
        public decimal CalculateDemurrage(int daysUsed)
        {
            if (daysUsed < 0)
            {
                throw new ArgumentOutOfRangeException(nameof(daysUsed), "Los dias usados no pueden ser negativos.");
            }

            if (daysUsed <= FreeDays || DetentionTiers.Count == 0)
            {
                return 0m;
            }

            decimal total = 0m;
            int firstChargeableDay = FreeDays + 1;

            foreach (Tier tier in DetentionTiers.OrderBy(tier => tier.StartDay))
            {
                ValidateTier(tier);

                int tierEndDay = tier.EndDay ?? int.MaxValue;
                int chargeStartDay = Math.Max(firstChargeableDay, tier.StartDay);
                int chargeEndDay = Math.Min(daysUsed, tierEndDay);

                if (chargeEndDay < chargeStartDay)
                {
                    continue;
                }

                total += (chargeEndDay - chargeStartDay + 1) * tier.DailyRate;
            }

            return total;
        }

        private static void ValidateTier(Tier tier)
        {
            if (tier.StartDay <= 0)
            {
                throw new InvalidOperationException("El inicio del tramo debe ser mayor que cero.");
            }

            if (tier.EndDay.HasValue && tier.EndDay.Value < tier.StartDay)
            {
                throw new InvalidOperationException("El fin del tramo no puede ser menor que el inicio.");
            }

            if (tier.DailyRate < 0m)
            {
                throw new InvalidOperationException("La tarifa diaria no puede ser negativa.");
            }
        }
    }
}
