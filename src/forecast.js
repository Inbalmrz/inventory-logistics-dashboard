// Forecast layer: estimates only, kept apart from source data and calculated measures.
// Every field it adds starts with "forecast" so the UI can always tell an estimate from a fact.
(function (App) {
  function apply(model) {
    for (const r of model.stock) {
      const cover = r.avgDailyOut > 0 ? r.qty / r.avgDailyOut : null;
      r.forecastDaysCover = cover;
      r.forecastRunout = cover == null ? null : App.dayStr(model.asOfDay + Math.floor(cover));
      const arrivesInTime = r.nextArrival && r.forecastRunout && r.nextArrival <= r.forecastRunout;
      r.forecastRisk = r.qty > 0 && cover != null && cover < r.plannedLeadDays && !arrivesInTime;
    }
  }
  App.forecast = { apply };
})(window.App);
