using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using SeaCharter.DTOs.Pricing;
using SeaCharter.Models.Pricing;

namespace SeaCharter.Services.Pricing
{
    /// <summary>
    /// Servicio de generacion documental para ofertas de venta Rodahmar Shipping.
    /// En la aplicacion Netlify el PDF se renderiza con jsPDF y se persiste en Blobs; este servicio
    /// conserva el contrato C# equivalente para integraciones .NET que usen QuestPDF o iText7.
    /// </summary>
    public class PdfGeneratorService
    {
        public byte[] GenerateSalesQuotePdf(SalesQuote quote)
        {
            return GenerateSalesQuotePdf(quote, null);
        }

        public byte[] GenerateSalesQuotePdf(SalesQuote quote, IReadOnlyCollection<SelectedEquipment>? selectedEquipmentList)
        {
            if (quote == null)
            {
                throw new ArgumentNullException(nameof(quote));
            }

            var lines = new List<string>
            {
                "RODAHMAR SHIPPING",
                $"Sales Quote: {quote.QuoteId}",
                $"Customer: {quote.CustomerName}",
                $"Route: {quote.PortOfLoading} -> {quote.PortOfDischarge}",
                "Charges"
            };

            IReadOnlyList<SalesQuoteLine> printableLines = ResolvePrintableLines(quote.Lines, selectedEquipmentList);
            foreach (SalesQuoteLine line in printableLines)
            {
                lines.Add($"{line.Concept} | {line.ChargeLevel} | {line.Currency} {line.SellAmount:0.00}");
            }

            decimal printableTotal = printableLines.Sum(line => line.SellAmount);
            lines.Add($"Total: {quote.BaseCurrency} {printableTotal:0.00}");
            lines.Add("Disclaimer legal");
            lines.AddRange(Wrap(quote.LegalDisclaimer, 92));

            return BuildSimplePdf(lines);
        }

        private static IReadOnlyList<SalesQuoteLine> ResolvePrintableLines(
            IEnumerable<SalesQuoteLine> allAvailableCosts,
            IReadOnlyCollection<SelectedEquipment>? selectedEquipmentList)
        {
            var selectedEquipment = selectedEquipmentList?
                .Where(item => item.Quantity > 0 && !string.IsNullOrWhiteSpace(item.ContainerType))
                .ToList() ?? new List<SelectedEquipment>();

            IEnumerable<SalesQuoteLine> equipmentLines = selectedEquipment.Count == 0
                ? allAvailableCosts.Where(line => IsEquipmentLevel(line.ChargeLevel))
                : selectedEquipment.SelectMany(equipment =>
                    allAvailableCosts.Where(line => IsEquipmentLineLinkedToSelection(line, equipment))
                        .Select(line => new SalesQuoteLine
                        {
                            Concept = line.Concept,
                            Category = line.Category,
                            ChargeLevel = line.ChargeLevel,
                            ContainerType = line.ContainerType,
                            LinkedEquipmentId = line.LinkedEquipmentId,
                            Currency = line.Currency,
                            Quantity = equipment.Quantity,
                            CarrierCost = line.CarrierCost,
                            MarkupPercent = line.MarkupPercent,
                            FixedFee = line.FixedFee,
                            SellAmount = line.SellAmount * equipment.Quantity
                        }));

            IEnumerable<SalesQuoteLine> billOfLadingLines = allAvailableCosts
                .Where(line => line.ChargeLevel == ChargeLevel.PerBillOfLading);

            return equipmentLines
                .Concat(billOfLadingLines)
                .GroupBy(line => new
                {
                    Concept = NormalizeConcept(line.Concept),
                    line.ChargeLevel,
                    Currency = NormalizeCurrency(line.Currency)
                })
                .Select(group =>
                {
                    SalesQuoteLine first = group.First();
                    return new SalesQuoteLine
                    {
                        Concept = first.Concept,
                        Category = first.Category,
                        ChargeLevel = first.ChargeLevel,
                        ContainerType = first.ContainerType,
                        LinkedEquipmentId = first.LinkedEquipmentId,
                        Currency = NormalizeCurrency(first.Currency),
                        Quantity = group.Sum(line => line.Quantity),
                        SellAmount = group.Sum(line => line.SellAmount)
                    };
                })
                .OrderBy(line => line.ChargeLevel == ChargeLevel.PerBillOfLading ? 1 : 0)
                .ThenBy(line => line.Concept)
                .ToList();
        }

        private static bool IsEquipmentLineLinkedToSelection(SalesQuoteLine line, SelectedEquipment selectedEquipment)
        {
            if (!IsEquipmentLevel(line.ChargeLevel))
            {
                return false;
            }

            if (!string.IsNullOrWhiteSpace(line.LinkedEquipmentId))
            {
                return string.Equals(line.LinkedEquipmentId, selectedEquipment.Id, StringComparison.OrdinalIgnoreCase);
            }

            return NormalizeContainerType(line.ContainerType) == NormalizeContainerType(selectedEquipment.ContainerType);
        }

        private static bool IsEquipmentLevel(ChargeLevel chargeLevel)
        {
            return chargeLevel == ChargeLevel.PerEquipment || chargeLevel == ChargeLevel.PerContainer;
        }

        private static string NormalizeConcept(string concept)
        {
            return string.Join(" ", (concept ?? string.Empty).Trim().ToUpperInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries));
        }

        private static string NormalizeCurrency(string? currency)
        {
            return string.IsNullOrWhiteSpace(currency) ? "USD" : currency.Trim().ToUpperInvariant();
        }

        private static string NormalizeContainerType(string? containerType)
        {
            string normalized = (containerType ?? string.Empty).Trim().ToUpperInvariant()
                .Replace("'", string.Empty)
                .Replace(" ", string.Empty)
                .Replace("-", string.Empty)
                .Replace("_", string.Empty);

            return normalized switch
            {
                "20" or "20ST" or "20STD" or "20STANDARD" or "20DV" => "20ST",
                "40" or "40ST" or "40STD" or "40STANDARD" or "40DV" => "40ST",
                "40HC" or "40HQ" or "40HIGHCUBE" => "40HC",
                "REEFER" or "RF" or "40RF" or "40REEFER" => "REEFER",
                "FLATRACK" or "20FLATRACK" or "FR" or "20FR" => "FLAT_RACK",
                "OPENTOP" or "20OPENTOP" or "OT" or "20OT" => "OPEN_TOP",
                _ => normalized
            };
        }

        private static byte[] BuildSimplePdf(IReadOnlyList<string> lines)
        {
            string content = "BT /F1 10 Tf 50 790 Td 14 TL " +
                string.Join(" T* ", lines.Select(line => $"({EscapePdfText(line)}) Tj")) +
                " ET";

            var objects = new[]
            {
                "<< /Type /Catalog /Pages 2 0 R >>",
                "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
                "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
                "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
                $"<< /Length {Encoding.ASCII.GetByteCount(content)} >>\nstream\n{content}\nendstream"
            };

            using var stream = new MemoryStream();
            using var writer = new StreamWriter(stream, Encoding.ASCII, 1024, leaveOpen: true);
            writer.WriteLine("%PDF-1.4");
            var offsets = new List<long> { 0 };

            for (int index = 0; index < objects.Length; index++)
            {
                writer.Flush();
                offsets.Add(stream.Position);
                writer.WriteLine($"{index + 1} 0 obj");
                writer.WriteLine(objects[index]);
                writer.WriteLine("endobj");
            }

            writer.Flush();
            long xrefPosition = stream.Position;
            writer.WriteLine("xref");
            writer.WriteLine($"0 {offsets.Count}");
            writer.WriteLine("0000000000 65535 f ");
            foreach (long offset in offsets.Skip(1))
            {
                writer.WriteLine($"{offset:0000000000} 00000 n ");
            }
            writer.WriteLine("trailer");
            writer.WriteLine($"<< /Size {offsets.Count} /Root 1 0 R >>");
            writer.WriteLine("startxref");
            writer.WriteLine(xrefPosition);
            writer.WriteLine("%%EOF");
            writer.Flush();
            return stream.ToArray();
        }

        private static IEnumerable<string> Wrap(string text, int width)
        {
            string value = string.IsNullOrWhiteSpace(text) ? string.Empty : text;
            for (int start = 0; start < value.Length; start += width)
            {
                yield return value.Substring(start, Math.Min(width, value.Length - start));
            }
        }

        private static string EscapePdfText(string value)
        {
            return value.Replace("\\", "\\\\").Replace("(", "\\(").Replace(")", "\\)");
        }
    }
}
