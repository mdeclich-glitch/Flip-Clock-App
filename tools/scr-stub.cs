using System; using System.Diagnostics; using System.IO;
static class Stub {
  static int Main(string[] a) {
    string f = a.Length > 0 ? a[0].ToLowerInvariant() : "/c";
    if (f.StartsWith("/p")) return 0;                         // anteprima: niente
    string exe = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                              "Programs", "Flip Clock", "Flip Clock.exe");
    if (!File.Exists(exe)) return 1;
    bool saver = f.StartsWith("/s");
    using (var p = Process.Start(new ProcessStartInfo(exe, saver ? "--screensaver" : "") { UseShellExecute = false }))
      if (saver) p.WaitForExit();
    return 0;
  }
}