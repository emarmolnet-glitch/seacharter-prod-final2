using System;
using System.Collections.Generic;
using System.Linq;

namespace SeaCharter.Models.Pricing
{
    /// <summary>
    /// Cotizacion de venta lista para emitirse al cliente sin exponer costes de compra.
    /// </summary>
    public class SalesQuote
    {
        public string QuoteId { get; set; } = $"RDM-FCL-{DateTime.UtcNow:yyyyMMddHHmmss}";

        public string CustomerName { get; set; } = "Cliente";

        public string CarrierName { get; set; } = "Naviera";

        public string PortOfLoading { get; set; } = string.Empty;

        public string PortOfDischarge { get; set; } = string.Empty;

        public string BaseCurrency { get; set; } = "EUR";

        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

        public IList<SalesQuoteLine> Lines { get; set; } = new List<SalesQuoteLine>();

        public decimal TotalSellAmount => Lines.Sum(line => line.SellAmount);

        public string LegalDisclaimer { get; set; } =
            "Quotation subject to carrier space, equipment availability, final booking confirmation, applicable local charges, taxes, duties, customs inspections, congestion, force majeure events and any carrier or terminal surcharges valid at time of shipment. Rates are confidential and issued without prejudice to Rodahmar Shipping's standard terms and conditions.";
    }

    public class SalesQuoteLine
    {
        public string Concept { get; set; } = string.Empty;

        public ChargeCategory Category { get; set; }

        public ChargeLevel ChargeLevel { get; set; }

        public string? ContainerType { get; set; }

        public string? LinkedEquipmentId { get; set; }

        public string Currency { get; set; } = "USD";

        public decimal Quantity { get; set; } = 1m;

        public decimal CarrierCost { get; set; }

        public decimal MarkupPercent { get; set; }

        public decimal FixedFee { get; set; }

        public decimal SellAmount { get; set; }
    }
}
