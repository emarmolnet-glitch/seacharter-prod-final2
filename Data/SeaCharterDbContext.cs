using Microsoft.EntityFrameworkCore;
using SeaCharter.Models.Demurrage;
using SeaCharter.Models.MarketData;
using SeaCharter.Models.Pricing;

namespace SeaCharter.Data
{
    /// <summary>
    /// Contexto de datos minimo para las tablas maestras consumidas por PricingEngineService.
    /// </summary>
    public class SeaCharterDbContext : DbContext
    {
        public SeaCharterDbContext(DbContextOptions<SeaCharterDbContext> options)
            : base(options)
        {
        }

        public DbSet<BaseOceanRate> BaseOceanRates => Set<BaseOceanRate>();

        public DbSet<LogisticCharge> LogisticCharges => Set<LogisticCharge>();

        public DbSet<DynamicSurcharge> DynamicSurcharges => Set<DynamicSurcharge>();

        public DbSet<QuoteSurcharge> QuoteSurcharges => Set<QuoteSurcharge>();

        public DbSet<MarginPolicy> MarginPolicies => Set<MarginPolicy>();

        public DbSet<MarketReferenceData> MarketReferenceData => Set<MarketReferenceData>();

        public DbSet<FreeTimeCondition> FreeTimeConditions => Set<FreeTimeCondition>();

        public DbSet<Tier> FreeTimeTiers => Set<Tier>();

        public DbSet<QuoteDisclaimer> QuoteDisclaimers => Set<QuoteDisclaimer>();

        public DbSet<ContainerSpecification> ContainerSpecifications => Set<ContainerSpecification>();
    }
}
