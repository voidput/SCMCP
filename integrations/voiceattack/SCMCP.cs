// VoiceAttack inline C# — query the SCMCP daemon and hand the answer back for TTS.
//
// Why inline C# rather than "Run an application": shelling out to curl or
// PowerShell flashes a console window over the game every time you speak. This
// runs in-process and is silent.
//
// SETUP
//   1. In VoiceAttack, edit a command and add:
//        Other > Advanced > Execute an Inline Function > C# Code
//      Paste this whole file in.
//   2. Before that action, add "Set a Text Value":
//        ~path  =  /say/sell?commodity={TXT:~commodity}
//   3. After it, add:
//        Other > Sounds > Say something with text-to-speech  ->  {TXT:~answer}
//
// A worked command, "where should I sell [Gold;Laranite;Titanium]":
//   Set Text  ~commodity  to  {TXT:1}          (from the dynamic phrase list)
//   Set Text  ~path       to  /say/sell?commodity={TXT:~commodity}
//   Inline C# (this file)
//   Say with TTS  {TXT:~answer}
//
// Optional text variables, all with sensible defaults:
//   ~scmcpUrl    base URL          (default http://127.0.0.1:7331)
//   ~scmcpToken  shared secret     (only if you set SCMCP_HTTP_TOKEN)
//   ~timeoutMs   request timeout   (default 20000)
//
// Run integrations/voiceattack/generate-grammar.mjs to produce the
// [Gold;Laranite;...] phrase list from live commodity data.

using System;
using System.IO;
using System.Net;
using System.Text;

public class VAInline
{
    public void main()
    {
        string answer;

        try
        {
            string baseUrl = VA.GetText("~scmcpUrl");
            if (string.IsNullOrEmpty(baseUrl)) baseUrl = "http://127.0.0.1:7331";

            string path = VA.GetText("~path");
            if (string.IsNullOrEmpty(path))
            {
                VA.SetText("~answer", "No request path was set.");
                VA.WriteToLog("SCMCP: ~path is empty; nothing to request.", "red");
                return;
            }

            int timeoutMs = 20000;
            string timeoutText = VA.GetText("~timeoutMs");
            if (!string.IsNullOrEmpty(timeoutText)) int.TryParse(timeoutText, out timeoutMs);

            answer = Get(baseUrl.TrimEnd('/') + path, VA.GetText("~scmcpToken"), timeoutMs);
        }
        catch (WebException ex)
        {
            // Distinguish "daemon isn't running" from "daemon said no", because
            // the fix is completely different and you can't read a log in flight.
            if (ex.Status == WebExceptionStatus.ConnectFailure)
            {
                answer = "The Star Citizen daemon is not running.";
            }
            else if (ex.Status == WebExceptionStatus.Timeout)
            {
                answer = "That lookup timed out.";
            }
            else
            {
                answer = ReadErrorBody(ex);
            }
            VA.WriteToLog("SCMCP: " + ex.Message, "red");
        }
        catch (Exception ex)
        {
            answer = "That lookup failed.";
            VA.WriteToLog("SCMCP: " + ex.Message, "red");
        }

        VA.SetText("~answer", answer);
    }

    private string Get(string url, string token, int timeoutMs)
    {
        HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
        request.Method = "GET";
        request.Timeout = timeoutMs;
        request.ReadWriteTimeout = timeoutMs;
        // The daemon rejects anything that looks browser-originated, so send no
        // Origin header. Loopback should never go through a configured proxy.
        request.Proxy = null;
        request.UserAgent = "SCMCP-VoiceAttack";
        if (!string.IsNullOrEmpty(token)) request.Headers.Add("X-SCMCP-Token", token);

        using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
        using (StreamReader reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
        {
            return reader.ReadToEnd().Trim();
        }
    }

    private string ReadErrorBody(WebException ex)
    {
        // /say and /ask return speakable text even on 4xx, so prefer the body.
        try
        {
            if (ex.Response != null)
            {
                using (StreamReader reader =
                    new StreamReader(ex.Response.GetResponseStream(), Encoding.UTF8))
                {
                    string body = reader.ReadToEnd().Trim();
                    if (!string.IsNullOrEmpty(body) && !body.StartsWith("{")) return body;
                }
            }
        }
        catch { /* fall through to the generic message */ }

        return "That lookup failed.";
    }
}
