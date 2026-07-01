namespace SeaCharter.Models.Demurrage
{
    /// <summary>
    /// Tipo de penalizacion aplicada al contenedor.
    /// </summary>
    public enum DemurrageChargeType
    {
        /// <summary>
        /// Demora generada mientras el contenedor permanece en terminal.
        /// </summary>
        TerminalDemurrage = 1,

        /// <summary>
        /// Detencion generada cuando el contenedor esta fuera de terminal.
        /// </summary>
        OffTerminalDetention = 2
    }
}
