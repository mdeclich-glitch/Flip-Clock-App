using System; using System.Diagnostics; using System.IO; using System.Windows.Forms;
static class Stub {
  static int Main(string[] a) {
    string f = a.Length > 0 ? a[0].ToLowerInvariant() : "/c";
    if (f.StartsWith("/p")) return 0;

    string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
    string[] candidates = {
      @"C:\Flip Clock App\dist\win-unpacked\Flip Clock.exe",
      Path.Combine(local, "Programs", "Flip Clock", "Flip Clock.exe"),
    };
    string exe = null;
    foreach (var c in candidates) if (File.Exists(c)) { exe = c; break; }
    if (exe == null) {
      MessageBox.Show("Flip Clock.exe non trovato.\n\n" + string.Join("\n", candidates), "Flip Clock");
      return 1;
    }

    bool saver = f.StartsWith("/s");
    var psi = new ProcessStartInfo(exe, saver ? "--screensaver" : "") {
      UseShellExecute = false,
      WorkingDirectory = Path.GetDirectoryName(exe)
    };
    using (var p = Process.Start(psi))
      if (saver) p.WaitForExit();
    return 0;
  }
}