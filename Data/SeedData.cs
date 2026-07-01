using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using SeaCharter.Models.Pricing;

namespace SeaCharter.Data
{
    public static class SeedData
    {
        private const decimal CapacityUtilizationFactor = 0.90m;

        public static async Task InitializeAsync(SeaCharterDbContext dbContext, CancellationToken cancellationToken = default)
        {
            if (dbContext == null)
            {
                throw new ArgumentNullException(nameof(dbContext));
            }

            await SeedContainerSpecificationsAsync(dbContext, cancellationToken);
        }

        private static async Task SeedContainerSpecificationsAsync(SeaCharterDbContext dbContext, CancellationToken cancellationToken)
        {
            List<ContainerSpecification> specifications = CreateContainerSpecifications();
            List<string> containerTypes = specifications.Select(item => item.ContainerType).ToList();

            List<string> existingTypes = await dbContext.ContainerSpecifications
                .Where(item => containerTypes.Contains(item.ContainerType))
                .Select(item => item.ContainerType)
                .ToListAsync(cancellationToken);

            List<ContainerSpecification> missingSpecifications = specifications
                .Where(item => !existingTypes.Contains(item.ContainerType))
                .ToList();

            if (missingSpecifications.Count == 0)
            {
                return;
            }

            await dbContext.ContainerSpecifications.AddRangeAsync(missingSpecifications, cancellationToken);
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        private static List<ContainerSpecification> CreateContainerSpecifications()
        {
            return new List<ContainerSpecification>
            {
                CreateSpecification("20ST", "20' Standard", 5.89m, 2.35m, 2.39m, 33.20m, 21770m),
                CreateSpecification("40ST", "40' Standard", 12.03m, 2.35m, 2.39m, 67.70m, 26780m),
                CreateSpecification("40HC", "40' High Cube", 12.03m, 2.35m, 2.69m, 76.40m, 26580m),
                CreateSpecification("REEFER", "40' Reefer", 11.56m, 2.29m, 2.25m, 59.30m, 26480m),
                CreateSpecification("FLAT_RACK", "20' Flat Rack", 5.94m, 2.35m, 2.35m, 32.80m, 31260m),
                CreateSpecification("OPEN_TOP", "20' Open Top", 5.89m, 2.35m, 2.35m, 32.50m, 21740m)
            };
        }

        private static ContainerSpecification CreateSpecification(
            string containerType,
            string displayName,
            decimal internalLengthMeters,
            decimal internalWidthMeters,
            decimal internalHeightMeters,
            decimal maximumVolumeCbm,
            decimal maximumPayloadKg)
        {
            return new ContainerSpecification
            {
                ContainerType = containerType,
                DisplayName = displayName,
                InternalLengthMeters = internalLengthMeters,
                InternalWidthMeters = internalWidthMeters,
                InternalHeightMeters = internalHeightMeters,
                MaximumVolumeCbm = maximumVolumeCbm,
                MaximumPayloadKg = maximumPayloadKg,
                UtilizationFactor = CapacityUtilizationFactor,
                UsableVolumeCbm = Math.Round(maximumVolumeCbm * CapacityUtilizationFactor, 2, MidpointRounding.AwayFromZero),
                UsablePayloadKg = Math.Round(maximumPayloadKg * CapacityUtilizationFactor, 2, MidpointRounding.AwayFromZero),
                SourceNote = "Valores tecnicos extraidos del PDF de tipos de contenedores iContainers. Capacidad utilizable calculada al 90%."
            };
        }
    }
}
