namespace SeaCharter.Models.Pricing
{
    /// <summary>
    /// Categoria contable usada para aplicar margenes diferenciados.
    /// </summary>
    public enum ChargeCategory
    {
        OceanFreight = 1,
        Surcharge = 2,
        LocalOrigin = 3,
        LocalDestination = 4,
        Administrative = 5,
        CommodityNature = 6
    }
}
