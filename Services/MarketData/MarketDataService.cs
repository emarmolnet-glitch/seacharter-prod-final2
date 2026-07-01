using System;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SeaCharter.Data;
using SeaCharter.Models.MarketData;

namespace SeaCharter.Services.MarketData
{
    /// <summary>
    /// Servicio de integracion para actualizar indices de mercado desde una API financiera externa.
    /// </summary>
    public class MarketDataService
    {
        private const string FinancialApiUrl = "https://api.example.com/financial/market-indices";
        private readonly HttpClient _httpClient;
        private readonly SeaCharterDbContext _dbContext;
        private readonly ILogger<MarketDataService> _logger;

        public MarketDataService(
            HttpClient httpClient,
            SeaCharterDbContext dbContext,
            ILogger<MarketDataService> logger)
        {
            _httpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient));
            _dbContext = dbContext ?? throw new ArgumentNullException(nameof(dbContext));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        /// <summary>
        /// Obtiene los ultimos indices y actualiza la tabla MarketReferenceData.
        /// La llamada HTTP queda preparada para sustituir FinancialApiUrl por el proveedor real.
        /// </summary>
        public async Task<MarketReferenceData> FetchLatestIndicesAsync(CancellationToken cancellationToken = default)
        {
            MarketIndexPayload indices = await FetchFromFinancialApiAsync(cancellationToken);
            DateTime updatedAtUtc = DateTime.UtcNow;

            MarketReferenceData referenceData =
                await _dbContext.MarketReferenceData.FirstOrDefaultAsync(cancellationToken)
                ?? new MarketReferenceData();

            referenceData.BunkerPrice = indices.BunkerPrice;
            referenceData.EurUsdRate = indices.EurUsdRate;
            referenceData.InflationIndex = indices.InflationIndex;
            referenceData.UpdatedAtUtc = updatedAtUtc;

            if (referenceData.Id == 0)
            {
                _dbContext.MarketReferenceData.Add(referenceData);
            }

            await _dbContext.SaveChangesAsync(cancellationToken);

            _logger.LogInformation(
                "Indices de mercado actualizados en {UpdatedAtUtc:o}. BunkerPrice={BunkerPrice}, EurUsdRate={EurUsdRate}, InflationIndex={InflationIndex}",
                updatedAtUtc,
                referenceData.BunkerPrice,
                referenceData.EurUsdRate,
                referenceData.InflationIndex);

            return referenceData;
        }

        private async Task<MarketIndexPayload> FetchFromFinancialApiAsync(CancellationToken cancellationToken)
        {
            try
            {
                MarketIndexPayload? payload = await _httpClient.GetFromJsonAsync<MarketIndexPayload>(
                    FinancialApiUrl,
                    cancellationToken);

                if (payload != null)
                {
                    return payload;
                }
            }
            catch (HttpRequestException ex)
            {
                _logger.LogWarning(ex, "No se pudo consultar la API financiera. Se usan indices simulados.");
            }
            catch (TaskCanceledException ex) when (!cancellationToken.IsCancellationRequested)
            {
                _logger.LogWarning(ex, "Timeout al consultar la API financiera. Se usan indices simulados.");
            }

            return new MarketIndexPayload
            {
                BunkerPrice = 642.75m,
                EurUsdRate = 1.0835m,
                InflationIndex = 0.0325m
            };
        }

        private sealed class MarketIndexPayload
        {
            public decimal BunkerPrice { get; set; }

            public decimal EurUsdRate { get; set; }

            public decimal InflationIndex { get; set; }
        }
    }
}
