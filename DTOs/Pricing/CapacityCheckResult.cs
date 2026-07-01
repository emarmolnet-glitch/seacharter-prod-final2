namespace SeaCharter.DTOs.Pricing
{
    public class CapacityCheckResult
    {
        public bool Fits { get; set; }

        public int SuggestedEquipmentCount { get; set; }

        public decimal UsableVolumeCbm { get; set; }

        public decimal UsablePayloadKg { get; set; }

        public string ContainerType { get; set; } = string.Empty;

        public string Message { get; set; } = string.Empty;
    }
}
