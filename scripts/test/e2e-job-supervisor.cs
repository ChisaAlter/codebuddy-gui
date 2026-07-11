using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace CodeBuddy.E2E
{
    public static class JobSupervisor
    {
        private const uint CREATE_SUSPENDED = 0x00000004;
        private const uint CREATE_UNICODE_ENVIRONMENT = 0x00000400;
        private const uint EXTENDED_STARTUPINFO_PRESENT = 0x00080000;
        private const uint STARTF_USESTDHANDLES = 0x00000100;
        private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
        private const int JobObjectBasicAccountingInformation = 1;
        private const int JobObjectExtendedLimitInformation = 9;
        private const uint JOB_OBJECT_QUERY = 0x0004;
        private const uint JOB_OBJECT_TERMINATE = 0x0008;
        private const uint DUPLICATE_SAME_ACCESS = 0x00000002;
        private const uint GENERIC_READ = 0x80000000;
        private const uint GENERIC_WRITE = 0x40000000;
        private const uint FILE_SHARE_READ = 0x00000001;
        private const uint FILE_SHARE_WRITE = 0x00000002;
        private const uint OPEN_EXISTING = 3;
        private const uint MOVEFILE_REPLACE_EXISTING = 0x00000001;
        private const uint MOVEFILE_WRITE_THROUGH = 0x00000008;
        private const uint WAIT_OBJECT_0 = 0x00000000;
        private const uint WAIT_TIMEOUT = 0x00000102;
        private const int STD_OUTPUT_HANDLE = -11;
        private const int STD_ERROR_HANDLE = -12;
        private const int ERROR_ALREADY_EXISTS = 183;
        private const int ERROR_INSUFFICIENT_BUFFER = 122;
        private const int ERROR_FILE_NOT_FOUND = 2;
        private static readonly IntPtr INVALID_HANDLE_VALUE = new IntPtr(-1);
        private static readonly IntPtr PROC_THREAD_ATTRIBUTE_HANDLE_LIST = new IntPtr(0x00020002);

        [StructLayout(LayoutKind.Sequential)]
        private struct SECURITY_ATTRIBUTES
        {
            public int nLength;
            public IntPtr lpSecurityDescriptor;
            [MarshalAs(UnmanagedType.Bool)] public bool bInheritHandle;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct STARTUPINFO
        {
            public int cb;
            public string lpReserved;
            public string lpDesktop;
            public string lpTitle;
            public uint dwX;
            public uint dwY;
            public uint dwXSize;
            public uint dwYSize;
            public uint dwXCountChars;
            public uint dwYCountChars;
            public uint dwFillAttribute;
            public uint dwFlags;
            public short wShowWindow;
            public short cbReserved2;
            public IntPtr lpReserved2;
            public IntPtr hStdInput;
            public IntPtr hStdOutput;
            public IntPtr hStdError;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct STARTUPINFOEX
        {
            public STARTUPINFO StartupInfo;
            public IntPtr lpAttributeList;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct PROCESS_INFORMATION
        {
            public IntPtr hProcess;
            public IntPtr hThread;
            public uint dwProcessId;
            public uint dwThreadId;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct JOBOBJECT_BASIC_LIMIT_INFORMATION
        {
            public long PerProcessUserTimeLimit;
            public long PerJobUserTimeLimit;
            public uint LimitFlags;
            public UIntPtr MinimumWorkingSetSize;
            public UIntPtr MaximumWorkingSetSize;
            public uint ActiveProcessLimit;
            public UIntPtr Affinity;
            public uint PriorityClass;
            public uint SchedulingClass;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct IO_COUNTERS
        {
            public ulong ReadOperationCount;
            public ulong WriteOperationCount;
            public ulong OtherOperationCount;
            public ulong ReadTransferCount;
            public ulong WriteTransferCount;
            public ulong OtherTransferCount;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
        {
            public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
            public IO_COUNTERS IoInfo;
            public UIntPtr ProcessMemoryLimit;
            public UIntPtr JobMemoryLimit;
            public UIntPtr PeakProcessMemoryUsed;
            public UIntPtr PeakJobMemoryUsed;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct JOBOBJECT_BASIC_ACCOUNTING_INFORMATION
        {
            public long TotalUserTime;
            public long TotalKernelTime;
            public long ThisPeriodTotalUserTime;
            public long ThisPeriodTotalKernelTime;
            public uint TotalPageFaultCount;
            public uint TotalProcesses;
            public uint ActiveProcesses;
            public uint TotalTerminatedProcesses;
        }

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr CreateJobObject(IntPtr attributes, string name);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr OpenJobObject(uint access, bool inherit, string name);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SetInformationJobObject(IntPtr job, int type,
            ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION info, uint length);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool QueryInformationJobObject(IntPtr job, int type,
            out JOBOBJECT_BASIC_ACCOUNTING_INFORMATION info, uint length, out uint returned);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool TerminateJobObject(IntPtr job, uint exitCode);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool CreateProcessW(string applicationName, StringBuilder commandLine,
            IntPtr processAttributes, IntPtr threadAttributes, bool inheritHandles, uint creationFlags,
            IntPtr environment, string currentDirectory, ref STARTUPINFOEX startup,
            out PROCESS_INFORMATION processInformation);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern uint ResumeThread(IntPtr thread);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool TerminateProcess(IntPtr process, uint exitCode);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr handle);
        [DllImport("kernel32.dll")]
        private static extern IntPtr GetCurrentProcess();
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool DuplicateHandle(IntPtr sourceProcess, IntPtr sourceHandle,
            IntPtr targetProcess, out IntPtr targetHandle, uint access, bool inherit, uint options);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr GetStdHandle(int standardHandle);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr CreateFileW(string fileName, uint access, uint share,
            ref SECURITY_ATTRIBUTES attributes, uint disposition, uint flags, IntPtr template);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool InitializeProcThreadAttributeList(IntPtr list, int count,
            int flags, ref IntPtr size);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags,
            IntPtr attribute, IntPtr value, IntPtr size, IntPtr previous, IntPtr returned);
        [DllImport("kernel32.dll")]
        private static extern void DeleteProcThreadAttributeList(IntPtr list);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool MoveFileEx(string existing, string replacement, uint flags);

        private sealed class BoundaryState
        {
            public string JobName = String.Empty;
            public bool KillOnJobClose;
            public bool RootCreatedSuspended;
            public bool RootAssignedBeforeResume;
            public bool RootResumed;
            public bool Established;
            public uint RootPid;
            public int ActiveProcessCount = -1;
            public bool ZeroVerified;
            public bool JobClosed;
            public string CloseReason = "starting";
            public int Win32Error;
        }

        private sealed class SupervisorBoundary : IDisposable
        {
            private readonly string statePath;
            private readonly BoundaryState state;
            private IntPtr jobHandle;
            private IntPtr processHandle;
            private IntPtr threadHandle;
            private bool boundaryClosed;
            private bool processAssigned;

            public SupervisorBoundary(string jobName, string stateFile)
            {
                statePath = stateFile;
                state = new BoundaryState();
                state.JobName = jobName;
                WriteState();
            }

            public void CreateJob()
            {
                jobHandle = CreateJobObject(IntPtr.Zero, state.JobName);
                if (!IsValidHandle(jobHandle)) ThrowWin32("create-job");
                int createError = Marshal.GetLastWin32Error();
                if (createError == ERROR_ALREADY_EXISTS)
                {
                    CloseNativeHandle(ref jobHandle);
                    throw new InvalidOperationException("job-name-collision");
                }
                JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
                limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                if (!SetInformationJobObject(jobHandle, JobObjectExtendedLimitInformation, ref limits,
                    (uint)Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION))))
                {
                    ThrowWin32("set-job-limits");
                }
                state.KillOnJobClose = true;
                RefreshActiveCount();
                WriteState();
            }

            public void CreateAssignAndResume(string executable, string[] arguments,
                string workingDirectory, string[] environmentKeys, string[] environmentValues)
            {
                IntPtr inheritedInput = IntPtr.Zero;
                IntPtr inheritedOutput = IntPtr.Zero;
                IntPtr inheritedError = IntPtr.Zero;
                IntPtr handleArray = IntPtr.Zero;
                IntPtr attributeList = IntPtr.Zero;
                IntPtr environmentBlock = IntPtr.Zero;
                try
                {
                    SECURITY_ATTRIBUTES security = new SECURITY_ATTRIBUTES();
                    security.nLength = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES));
                    security.bInheritHandle = true;
                    inheritedInput = CreateFileW("NUL", GENERIC_READ | GENERIC_WRITE,
                        FILE_SHARE_READ | FILE_SHARE_WRITE, ref security, OPEN_EXISTING, 0, IntPtr.Zero);
                    if (!IsValidHandle(inheritedInput)) ThrowWin32("open-null-input");
                    inheritedOutput = DuplicateStandardHandle(STD_OUTPUT_HANDLE, "duplicate-stdout");
                    inheritedError = DuplicateStandardHandle(STD_ERROR_HANDLE, "duplicate-stderr");

                    IntPtr attributeBytes = IntPtr.Zero;
                    bool sizingResult = InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref attributeBytes);
                    int sizingError = Marshal.GetLastWin32Error();
                    if (sizingResult || sizingError != ERROR_INSUFFICIENT_BUFFER || attributeBytes == IntPtr.Zero)
                    {
                        throw new Win32Exception(sizingError, "attribute-list-sizing");
                    }
                    attributeList = Marshal.AllocHGlobal(attributeBytes);
                    if (!InitializeProcThreadAttributeList(attributeList, 1, 0, ref attributeBytes))
                    {
                        ThrowWin32("attribute-list-init");
                    }
                    IntPtr[] inheritedHandles = new IntPtr[] { inheritedInput, inheritedOutput, inheritedError };
                    handleArray = Marshal.AllocHGlobal(IntPtr.Size * inheritedHandles.Length);
                    for (int index = 0; index < inheritedHandles.Length; index += 1)
                    {
                        Marshal.WriteIntPtr(handleArray, index * IntPtr.Size, inheritedHandles[index]);
                    }
                    if (!UpdateProcThreadAttribute(attributeList, 0, PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
                        handleArray, new IntPtr(IntPtr.Size * inheritedHandles.Length), IntPtr.Zero, IntPtr.Zero))
                    {
                        ThrowWin32("attribute-handle-list");
                    }

                    STARTUPINFOEX startup = new STARTUPINFOEX();
                    startup.StartupInfo.cb = Marshal.SizeOf(typeof(STARTUPINFOEX));
                    startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
                    startup.StartupInfo.hStdInput = inheritedInput;
                    startup.StartupInfo.hStdOutput = inheritedOutput;
                    startup.StartupInfo.hStdError = inheritedError;
                    startup.lpAttributeList = attributeList;
                    StringBuilder commandLine = new StringBuilder(BuildCommandLine(executable, arguments));
                    if (commandLine.Length > 32766) throw new InvalidOperationException("command-line-too-long");
                    environmentBlock = Marshal.StringToHGlobalUni(
                        BuildEnvironmentBlock(environmentKeys, environmentValues));

                    PROCESS_INFORMATION processInfo;
                    uint flags = CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT | EXTENDED_STARTUPINFO_PRESENT;
                    if (!CreateProcessW(executable, commandLine, IntPtr.Zero, IntPtr.Zero, true, flags,
                        environmentBlock, workingDirectory, ref startup, out processInfo))
                    {
                        ThrowWin32("create-root-suspended");
                    }
                    processHandle = processInfo.hProcess;
                    threadHandle = processInfo.hThread;
                    state.RootPid = processInfo.dwProcessId;
                    state.RootCreatedSuspended = true;
                    RefreshActiveCount();
                    WriteState();

                    if (!AssignProcessToJobObject(jobHandle, processHandle)) ThrowWin32("assign-root-to-job");
                    processAssigned = true;
                    state.RootAssignedBeforeResume = true;
                    RefreshActiveCount();
                    WriteState();

                    uint previousSuspendCount = ResumeThread(threadHandle);
                    if (previousSuspendCount == UInt32.MaxValue) ThrowWin32("resume-root");
                    state.RootResumed = true;
                    state.Established = true;
                    state.CloseReason = "running";
                    RefreshActiveCount();
                    WriteState();
                    CloseNativeHandle(ref threadHandle);
                }
                finally
                {
                    if (environmentBlock != IntPtr.Zero) Marshal.FreeHGlobal(environmentBlock);
                    if (handleArray != IntPtr.Zero) Marshal.FreeHGlobal(handleArray);
                    if (attributeList != IntPtr.Zero)
                    {
                        DeleteProcThreadAttributeList(attributeList);
                        Marshal.FreeHGlobal(attributeList);
                    }
                    CloseNativeHandle(ref inheritedInput);
                    CloseNativeHandle(ref inheritedOutput);
                    CloseNativeHandle(ref inheritedError);
                }
            }

            public void Close(string reason)
            {
                if (boundaryClosed) return;
                boundaryClosed = true;
                state.CloseReason = NormalizeCloseReason(reason);
                if (state.RootCreatedSuspended && !processAssigned && IsValidHandle(processHandle))
                {
                    if (!TerminateProcess(processHandle, 1) && state.Win32Error == 0)
                    {
                        state.Win32Error = Marshal.GetLastWin32Error();
                    }
                }
                if (IsValidHandle(jobHandle))
                {
                    if (!TerminateJobObject(jobHandle, 1) && state.Win32Error == 0)
                    {
                        state.Win32Error = Marshal.GetLastWin32Error();
                    }
                    state.ZeroVerified = WaitForZero(jobHandle, 10000, out state.ActiveProcessCount);
                    if (!CloseHandle(jobHandle) && state.Win32Error == 0)
                    {
                        state.Win32Error = Marshal.GetLastWin32Error();
                    }
                    jobHandle = IntPtr.Zero;
                    state.JobClosed = true;
                }
                if (IsValidHandle(processHandle))
                {
                    uint waitResult = WaitForSingleObject(processHandle, 5000);
                    if (waitResult != WAIT_OBJECT_0 && waitResult != WAIT_TIMEOUT && state.Win32Error == 0)
                    {
                        state.Win32Error = Marshal.GetLastWin32Error();
                    }
                }
                CloseNativeHandle(ref threadHandle);
                CloseNativeHandle(ref processHandle);
                WriteState();
            }

            public void RecordFailure(Exception error)
            {
                Win32Exception win32 = error as Win32Exception;
                if (win32 != null) state.Win32Error = win32.NativeErrorCode;
                state.CloseReason = "supervisor-error";
                WriteState();
            }

            public void Dispose()
            {
                Close("supervisor-finally");
            }

            private void RefreshActiveCount()
            {
                if (!IsValidHandle(jobHandle)) return;
                int active;
                if (TryQueryActiveCount(jobHandle, out active)) state.ActiveProcessCount = active;
            }

            private void WriteState()
            {
                WriteAtomicState(statePath, StateJson(state));
            }
        }

        public static int Supervise(string jobName, string executable, string[] arguments,
            string workingDirectory, string[] environmentKeys, string[] environmentValues, string statePath)
        {
            SupervisorBoundary boundary = new SupervisorBoundary(jobName, statePath);
            try
            {
                boundary.CreateJob();
                boundary.CreateAssignAndResume(executable, arguments, workingDirectory,
                    environmentKeys, environmentValues);
                string control = Console.In.ReadLine();
                if (control == null)
                {
                    boundary.Close("stdin-eof");
                }
                else if (String.Equals(control, "CLOSE", StringComparison.Ordinal))
                {
                    boundary.Close("controller-close");
                }
                else
                {
                    boundary.Close("invalid-control");
                    return 3;
                }
                return 0;
            }
            catch (Exception error)
            {
                boundary.RecordFailure(error);
                boundary.Close("supervisor-error");
                return 2;
            }
            finally
            {
                boundary.Dispose();
            }
        }

        public static string Terminate(string jobName)
        {
            IntPtr jobHandle = IntPtr.Zero;
            bool requested = false;
            bool zeroVerified = false;
            int activeProcessCount = -1;
            int win32Error = 0;
            string status = "open-job-error";
            try
            {
                jobHandle = OpenJobObject(JOB_OBJECT_QUERY | JOB_OBJECT_TERMINATE, false, jobName);
                if (!IsValidHandle(jobHandle))
                {
                    win32Error = Marshal.GetLastWin32Error();
                    status = win32Error == ERROR_FILE_NOT_FOUND ? "job-not-found" : "open-job-error";
                }
                else
                {
                    requested = true;
                    if (!TerminateJobObject(jobHandle, 1)) win32Error = Marshal.GetLastWin32Error();
                    zeroVerified = WaitForZero(jobHandle, 10000, out activeProcessCount);
                    status = zeroVerified ? "terminated" : "verification-failed";
                }
            }
            finally
            {
                if (IsValidHandle(jobHandle)) CloseHandle(jobHandle);
            }
            return TerminateJson(jobName, requested, zeroVerified, activeProcessCount,
                true, win32Error, status);
        }

        private static IntPtr DuplicateStandardHandle(int standardHandle, string operation)
        {
            IntPtr source = GetStdHandle(standardHandle);
            if (!IsValidHandle(source)) ThrowWin32(operation);
            IntPtr duplicate;
            IntPtr currentProcess = GetCurrentProcess();
            if (!DuplicateHandle(currentProcess, source, currentProcess, out duplicate,
                0, true, DUPLICATE_SAME_ACCESS))
            {
                ThrowWin32(operation);
            }
            return duplicate;
        }

        private static bool TryQueryActiveCount(IntPtr jobHandle, out int activeProcessCount)
        {
            JOBOBJECT_BASIC_ACCOUNTING_INFORMATION accounting;
            uint returned;
            bool queried = QueryInformationJobObject(jobHandle, JobObjectBasicAccountingInformation,
                out accounting, (uint)Marshal.SizeOf(typeof(JOBOBJECT_BASIC_ACCOUNTING_INFORMATION)), out returned);
            activeProcessCount = queried ? checked((int)accounting.ActiveProcesses) : -1;
            return queried;
        }

        private static bool WaitForZero(IntPtr jobHandle, int timeoutMs, out int activeProcessCount)
        {
            Stopwatch stopwatch = Stopwatch.StartNew();
            do
            {
                if (TryQueryActiveCount(jobHandle, out activeProcessCount) && activeProcessCount == 0) return true;
                Thread.Sleep(25);
            }
            while (stopwatch.ElapsedMilliseconds < timeoutMs);
            return TryQueryActiveCount(jobHandle, out activeProcessCount) && activeProcessCount == 0;
        }

        private static string BuildCommandLine(string executable, string[] arguments)
        {
            List<string> values = new List<string>();
            values.Add(executable);
            if (arguments != null) values.AddRange(arguments);
            StringBuilder commandLine = new StringBuilder();
            for (int index = 0; index < values.Count; index += 1)
            {
                if (index > 0) commandLine.Append(' ');
                commandLine.Append(QuoteWindowsArgument(values[index]));
            }
            return commandLine.ToString();
        }

        private static string QuoteWindowsArgument(string value)
        {
            if (value == null) value = String.Empty;
            if (value.Length == 0) return "\"\"";
            bool needsQuotes = false;
            for (int index = 0; index < value.Length; index += 1)
            {
                char character = value[index];
                if (Char.IsWhiteSpace(character) || character == '"')
                {
                    needsQuotes = true;
                    break;
                }
            }
            if (!needsQuotes) return value;

            StringBuilder quoted = new StringBuilder();
            quoted.Append('"');
            int backslashes = 0;
            for (int index = 0; index < value.Length; index += 1)
            {
                char character = value[index];
                if (character == '\\')
                {
                    backslashes += 1;
                }
                else if (character == '"')
                {
                    quoted.Append('\\', backslashes * 2 + 1);
                    quoted.Append('"');
                    backslashes = 0;
                }
                else
                {
                    quoted.Append('\\', backslashes);
                    backslashes = 0;
                    quoted.Append(character);
                }
            }
            quoted.Append('\\', backslashes * 2);
            quoted.Append('"');
            return quoted.ToString();
        }

        private static string BuildEnvironmentBlock(string[] keys, string[] values)
        {
            if (keys == null || values == null || keys.Length != values.Length)
            {
                throw new InvalidOperationException("environment-shape-invalid");
            }
            List<KeyValuePair<string, string>> entries = new List<KeyValuePair<string, string>>();
            for (int index = 0; index < keys.Length; index += 1)
            {
                entries.Add(new KeyValuePair<string, string>(keys[index], values[index]));
            }
            entries.Sort(delegate(KeyValuePair<string, string> left, KeyValuePair<string, string> right)
            {
                return StringComparer.OrdinalIgnoreCase.Compare(left.Key, right.Key);
            });
            StringBuilder block = new StringBuilder();
            for (int index = 0; index < entries.Count; index += 1)
            {
                block.Append(entries[index].Key);
                block.Append('=');
                block.Append(entries[index].Value);
                block.Append('\0');
            }
            block.Append('\0');
            return block.ToString();
        }

        private static string NormalizeCloseReason(string reason)
        {
            switch (reason)
            {
                case "stdin-eof":
                case "controller-close":
                case "invalid-control":
                case "supervisor-error":
                case "supervisor-finally":
                    return reason;
                default:
                    return "supervisor-finally";
            }
        }

        private static string StateJson(BoundaryState state)
        {
            return "{" +
                "\"version\":1," +
                "\"kind\":\"windows-job\"," +
                "\"jobName\":\"" + JsonEscape(state.JobName) + "\"," +
                "\"established\":" + JsonBoolean(state.Established) + "," +
                "\"rootCreatedSuspended\":" + JsonBoolean(state.RootCreatedSuspended) + "," +
                "\"rootAssignedBeforeResume\":" + JsonBoolean(state.RootAssignedBeforeResume) + "," +
                "\"rootResumed\":" + JsonBoolean(state.RootResumed) + "," +
                "\"killOnJobClose\":" + JsonBoolean(state.KillOnJobClose) + "," +
                "\"rootPid\":" + state.RootPid.ToString(System.Globalization.CultureInfo.InvariantCulture) + "," +
                "\"activeProcessCount\":" + state.ActiveProcessCount.ToString(System.Globalization.CultureInfo.InvariantCulture) + "," +
                "\"zeroVerified\":" + JsonBoolean(state.ZeroVerified) + "," +
                "\"jobClosed\":" + JsonBoolean(state.JobClosed) + "," +
                "\"closeReason\":\"" + JsonEscape(state.CloseReason) + "\"," +
                "\"win32Error\":" + state.Win32Error.ToString(System.Globalization.CultureInfo.InvariantCulture) +
                "}";
        }

        private static string TerminateJson(string jobName, bool requested, bool zeroVerified,
            int activeProcessCount, bool handleClosed, int win32Error, string status)
        {
            return "{" +
                "\"version\":1," +
                "\"kind\":\"windows-job\"," +
                "\"jobName\":\"" + JsonEscape(jobName) + "\"," +
                "\"terminateRequested\":" + JsonBoolean(requested) + "," +
                "\"zeroVerified\":" + JsonBoolean(zeroVerified) + "," +
                "\"activeProcessCount\":" + activeProcessCount.ToString(System.Globalization.CultureInfo.InvariantCulture) + "," +
                "\"jobHandleClosed\":" + JsonBoolean(handleClosed) + "," +
                "\"win32Error\":" + win32Error.ToString(System.Globalization.CultureInfo.InvariantCulture) + "," +
                "\"status\":\"" + JsonEscape(status) + "\"" +
                "}";
        }

        private static string JsonBoolean(bool value)
        {
            return value ? "true" : "false";
        }

        private static string JsonEscape(string value)
        {
            if (value == null) return String.Empty;
            StringBuilder escaped = new StringBuilder();
            for (int index = 0; index < value.Length; index += 1)
            {
                char character = value[index];
                switch (character)
                {
                    case '\\': escaped.Append("\\\\"); break;
                    case '"': escaped.Append("\\\""); break;
                    case '\r': escaped.Append("\\r"); break;
                    case '\n': escaped.Append("\\n"); break;
                    case '\t': escaped.Append("\\t"); break;
                    default:
                        if (character < 0x20)
                        {
                            escaped.Append("\\u");
                            escaped.Append(((int)character).ToString("x4"));
                        }
                        else escaped.Append(character);
                        break;
                }
            }
            return escaped.ToString();
        }

        private static void WriteAtomicState(string statePath, string json)
        {
            string temporary = statePath + ".tmp-" + Process.GetCurrentProcess().Id.ToString() +
                "-" + Guid.NewGuid().ToString("N");
            byte[] bytes = new UTF8Encoding(false).GetBytes(json + Environment.NewLine);
            try
            {
                using (FileStream stream = new FileStream(temporary, FileMode.CreateNew,
                    FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough))
                {
                    stream.Write(bytes, 0, bytes.Length);
                    stream.Flush();
                }
                if (!MoveFileEx(temporary, statePath, MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH))
                {
                    ThrowWin32("state-rename");
                }
            }
            finally
            {
                try
                {
                    if (File.Exists(temporary)) File.Delete(temporary);
                }
                catch
                {
                    // The owning runtime cleanup removes a crash-only temporary file.
                }
            }
        }

        private static bool IsValidHandle(IntPtr handle)
        {
            return handle != IntPtr.Zero && handle != INVALID_HANDLE_VALUE;
        }

        private static void CloseNativeHandle(ref IntPtr handle)
        {
            if (IsValidHandle(handle)) CloseHandle(handle);
            handle = IntPtr.Zero;
        }

        private static void ThrowWin32(string operation)
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), operation);
        }
    }
}
