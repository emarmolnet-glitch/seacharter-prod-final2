namespace SeaCharter.Models.Pricing
{
    /// <summary>
    /// Base de calculo de cada concepto tarifario.
    /// </summary>
    public enum CalculationBasis
    {
        PerShipment = 1,
        PerContainer = 2,
        PerRevenueTon = 3
    }
}
