using System.Threading;
using System.Threading.Tasks;
using SeaCharter.DTOs.Pricing;

namespace SeaCharter.Services.Pricing
{
    public interface IPricingEngineService
    {
        Task<QuoteResponse> CalculateQuoteAsync(QuoteRequest request, CancellationToken cancellationToken = default);

        QuoteBreakdown CalculateTotalQuote(
            System.Collections.Generic.List<SelectedEquipment> equipmentList,
            System.Collections.Generic.List<Surcharge> allSurcharges);

        bool CheckCapacity(decimal cargoVolume, decimal cargoWeight, string containerType, out int suggestedEquipmentCount);

        CapacityCheckResult CheckCapacity(decimal cargoVolume, decimal cargoWeight, string containerType);
    }
}
