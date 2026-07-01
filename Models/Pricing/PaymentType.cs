namespace SeaCharter.Models.Pricing
{
    /// <summary>
    /// Instruccion de pago declarada por la naviera para cada recargo de la cotizacion.
    /// Permite auditar si el coste se paga en origen, destino o en una plaza distinta.
    /// </summary>
    public enum PaymentType
    {
        Prepaid = 1,
        Collect = 2,
        Elsewhere = 3
    }
}
