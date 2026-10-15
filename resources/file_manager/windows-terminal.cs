using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

// ConPTY is hosted out of process: its blocking pipe reads must not block Bun's event loop.
public static class FileManagerTerminal
{
    [StructLayout(LayoutKind.Sequential)]
    struct Coord
    {
        public short X, Y;
        public Coord(int x, int y) { X = (short)x; Y = (short)y; }
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct StartupInfo
    {
        public int Size;
        public IntPtr Reserved, Desktop, Title;
        public int X, Y, XSize, YSize, XCountChars, YCountChars, FillAttribute, Flags;
        public short ShowWindow, ReservedSize;
        public IntPtr Reserved2, StdInput, StdOutput, StdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct StartupInfoEx
    {
        public StartupInfo StartupInfo;
        public IntPtr AttributeList;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct ProcessInfo
    {
        public IntPtr Process, Thread;
        public int ProcessId, ThreadId;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CreatePipe(out IntPtr read, out IntPtr write, IntPtr attributes, int size);
    [DllImport("kernel32.dll")]
    static extern int CreatePseudoConsole(Coord size, IntPtr input, IntPtr output, uint flags, out IntPtr console);
    [DllImport("kernel32.dll")]
    static extern int ResizePseudoConsole(IntPtr console, Coord size);
    [DllImport("kernel32.dll")]
    static extern void ClosePseudoConsole(IntPtr console);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, int flags, ref IntPtr size);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attribute, IntPtr value, IntPtr size, IntPtr previous, IntPtr returnSize);
    [DllImport("kernel32.dll")]
    static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool CreateProcessW(string application, StringBuilder command, IntPtr processAttributes, IntPtr threadAttributes,
        bool inheritHandles, uint flags, IntPtr environment, string directory, ref StartupInfoEx startup, out ProcessInfo process);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool ReadFile(IntPtr file, byte[] data, int size, out int read, IntPtr overlapped);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool WriteFile(IntPtr file, byte[] data, int size, out int written, IntPtr overlapped);
    [DllImport("kernel32.dll")]
    static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll")]
    static extern bool GetExitCodeProcess(IntPtr process, out int code);
    [DllImport("kernel32.dll")]
    static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll")]
    static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll")]
    static extern IntPtr GetStdHandle(int kind);
    [DllImport("kernel32.dll")]
    static extern bool SetStdHandle(int kind, IntPtr handle);

    static void Check(bool ok)
    {
        if (!ok) throw new Win32Exception(Marshal.GetLastWin32Error());
    }

    public static int Run(string shell, string directory, int columns, int rows)
    {
        IntPtr inputRead = IntPtr.Zero, inputWrite = IntPtr.Zero;
        IntPtr outputRead = IntPtr.Zero, outputWrite = IntPtr.Zero, console = IntPtr.Zero;
        IntPtr attributes = IntPtr.Zero;
        bool attributesInitialized = false;
        ProcessInfo process = new ProcessInfo();
        try
        {
            Check(CreatePipe(out inputRead, out inputWrite, IntPtr.Zero, 0));
            Check(CreatePipe(out outputRead, out outputWrite, IntPtr.Zero, 0));
            Marshal.ThrowExceptionForHR(CreatePseudoConsole(new Coord(columns, rows), inputRead, outputWrite, 0, out console));
            CloseHandle(inputRead); inputRead = IntPtr.Zero;
            CloseHandle(outputWrite); outputWrite = IntPtr.Zero;

            IntPtr bytes = IntPtr.Zero;
            InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref bytes);
            attributes = Marshal.AllocHGlobal(bytes);
            Check(InitializeProcThreadAttributeList(attributes, 1, 0, ref bytes));
            attributesInitialized = true;
            Check(UpdateProcThreadAttribute(attributes, 0, new IntPtr(0x00020016), console, new IntPtr(IntPtr.Size), IntPtr.Zero, IntPtr.Zero));
            StartupInfoEx startup = new StartupInfoEx();
            startup.StartupInfo.Size = Marshal.SizeOf(typeof(StartupInfoEx));
            startup.AttributeList = attributes;
            // Windows can copy redirected standard handles even with inheritHandles=false.
            // Do not let the shell read our control protocol instead of its pseudo-console.
            IntPtr originalInput = GetStdHandle(-10), originalOutput = GetStdHandle(-11), originalError = GetStdHandle(-12);
            SetStdHandle(-10, IntPtr.Zero); SetStdHandle(-11, IntPtr.Zero); SetStdHandle(-12, IntPtr.Zero);
            try
            {
                Check(CreateProcessW(shell, new StringBuilder("\"" + shell + "\" -NoLogo -NoProfile"), IntPtr.Zero, IntPtr.Zero,
                    false, 0x00080000, IntPtr.Zero, directory, ref startup, out process));
            }
            finally
            {
                SetStdHandle(-10, originalInput); SetStdHandle(-11, originalOutput); SetStdHandle(-12, originalError);
            }

            IntPtr readHandle = outputRead;
            Thread output = new Thread(() =>
            {
                Stream target = Console.OpenStandardOutput();
                byte[] buffer = new byte[8192];
                int count;
                while (ReadFile(readHandle, buffer, buffer.Length, out count, IntPtr.Zero) && count > 0)
                {
                    target.Write(buffer, 0, count);
                    target.Flush();
                }
            });
            output.IsBackground = true;
            output.Start();

            // EOF on Bun's input pipe is also the parent-death signal.
            Thread input = new Thread(() =>
            {
                try
                {
                    using (StreamReader reader = new StreamReader(Console.OpenStandardInput(), Encoding.UTF8))
                    {
                        string line;
                        while ((line = reader.ReadLine()) != null)
                        {
                            if (line.StartsWith("I:"))
                            {
                                byte[] data = Convert.FromBase64String(line.Substring(2));
                                int written;
                                Check(WriteFile(inputWrite, data, data.Length, out written, IntPtr.Zero));
                                if (written != data.Length) throw new IOException("Incomplete terminal input.");
                            }
                            else if (line.StartsWith("R:"))
                            {
                                string[] size = line.Split(':');
                                Marshal.ThrowExceptionForHR(ResizePseudoConsole(console, new Coord(int.Parse(size[1]), int.Parse(size[2]))));
                            }
                            else throw new IOException("Unknown terminal message.");
                        }
                    }
                }
                catch (Exception error)
                {
                    Console.Error.WriteLine("Windows terminal input failed: " + error.Message);
                }
                finally { TerminateProcess(process.Process, 1); }
            });
            input.IsBackground = true;
            input.Start();
            WaitForSingleObject(process.Process, 0xffffffff);
            int code;
            Check(GetExitCodeProcess(process.Process, out code));
            // Keep draining output while ClosePseudoConsole waits for its console host to finish.
            ClosePseudoConsole(console); console = IntPtr.Zero;
            output.Join(2000);
            return code;
        }
        finally
        {
            if (process.Process != IntPtr.Zero) { TerminateProcess(process.Process, 1); CloseHandle(process.Process); }
            if (process.Thread != IntPtr.Zero) CloseHandle(process.Thread);
            if (console != IntPtr.Zero) ClosePseudoConsole(console);
            if (attributesInitialized) DeleteProcThreadAttributeList(attributes);
            if (attributes != IntPtr.Zero) Marshal.FreeHGlobal(attributes);
            foreach (IntPtr handle in new[] { inputRead, inputWrite, outputRead, outputWrite })
                if (handle != IntPtr.Zero) CloseHandle(handle);
        }
    }
}
