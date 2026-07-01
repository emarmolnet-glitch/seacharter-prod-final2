namespace SeaCharter.Models.Pricing
{
    /// <summary>
    /// Nivel operativo en el que una naviera liquida un recargo dentro de su hoja de cotizacion.
    /// Esta estructura imita la cotizacion real de navieras como MSC para asegurar trazabilidad operativa.
    /// </summary>
    public enum ChargeLevel
    {
        PerEquipment = 1,
        PerBillOfLading = 2,
        PerTon = 3,
        PerContainer = 4
    }
}
