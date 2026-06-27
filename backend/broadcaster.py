"""
Frame Wireless - Live Broadcast Engine
Captures PC screen + system audio via ffmpeg and outputs HLS stream.
Mobile devices open /broadcast/stream.m3u8 to watch live.
"""
import sys
import os
import json
import subprocess
import shutil
import time
import signal


ffmpeg_proc = None


def check_ffmpeg():
    try:
        r = subprocess.run(['ffmpeg', '-version'], capture_output=True, timeout=5)
        return r.returncode == 0
    except Exception:
        return False


def start(quality, output_dir):
    global ffmpeg_proc

    if not check_ffmpeg():
        return {"error": "ffmpeg not found. Download from https://ffmpeg.org/download.html and add to PATH."}

    os.makedirs(output_dir, exist_ok=True)

    presets = {
        'low':    {'scale': '854:480',   'vb': '800k',  'fps': 10},
        'medium': {'scale': '1280:720',  'vb': '2000k', 'fps': 20},
        'high':   {'scale': '1920:1080', 'vb': '4000k', 'fps': 30},
    }
    pr = presets.get(quality, presets['medium'])

    playlist = os.path.join(output_dir, 'stream.m3u8')
    segment  = os.path.join(output_dir, 'seg%04d.ts')

    def build_cmd(with_audio):
        cmd = ['ffmpeg', '-y']
        # Screen capture (gdigrab = built-in Windows DirectShow screen grabber)
        cmd += ['-f', 'gdigrab', '-framerate', str(pr['fps']),
                '-draw_mouse', '1', '-i', 'desktop']
        if with_audio:
            # WASAPI loopback captures whatever audio is playing
            cmd += ['-f', 'wasapi', '-loopback', '-i', 'dummy']
        cmd += [
            '-vf',     f"scale={pr['scale']}:flags=lanczos",
            '-c:v',    'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency',
            '-b:v',    pr['vb'],  '-g', str(pr['fps'] * 2), '-sc_threshold', '0',
            '-crf',    '28',
        ]
        if with_audio:
            cmd += ['-c:a', 'aac', '-b:a', '128k', '-ar', '44100']
        else:
            cmd += ['-an']

        cmd += [
            '-f',              'hls',
            '-hls_time',       '2',
            '-hls_list_size',  '10',
            '-hls_flags',      'delete_segments+temp_file',
            '-hls_segment_filename', segment,
            playlist
        ]
        return cmd

    # Try with audio first, fall back to video-only
    for with_audio in (True, False):
        cmd = build_cmd(with_audio)
        ffmpeg_proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        time.sleep(3)
        if ffmpeg_proc.poll() is None:
            # Still running — success
            return {
                "success":   True,
                "playlist":  "stream.m3u8",
                "outputDir": output_dir,
                "audio":     with_audio,
                "note":      "" if with_audio else "Screen-only (no audio). For audio, ensure WASAPI is available."
            }
        err = (ffmpeg_proc.stderr.read() or b'').decode('utf-8', errors='ignore')
        ffmpeg_proc = None

    return {"error": f"ffmpeg could not start. Last error: {err[:400]}"}


def stop():
    global ffmpeg_proc
    if ffmpeg_proc:
        ffmpeg_proc.terminate()
        try: ffmpeg_proc.wait(timeout=4)
        except: ffmpeg_proc.kill()
        ffmpeg_proc = None
    return {"success": True}


if __name__ == '__main__':
    action    = sys.argv[1] if len(sys.argv) > 1 else 'check'
    quality   = sys.argv[2] if len(sys.argv) > 2 else 'medium'
    out_dir   = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(__file__), '..', 'public', 'broadcast')

    if action == 'check':
        print(json.dumps({"ffmpeg": check_ffmpeg()}), flush=True)
        sys.exit(0)

    elif action == 'start':
        result = start(quality, out_dir)
        print(json.dumps(result), flush=True)

        if result.get('success'):
            # Stay alive — monitor ffmpeg
            def on_signal(sig, frame):
                stop()
                sys.exit(0)
            signal.signal(signal.SIGTERM, on_signal)
            signal.signal(signal.SIGINT,  on_signal)

            while True:
                time.sleep(1)
                if ffmpeg_proc and ffmpeg_proc.poll() is not None:
                    print(json.dumps({"died": True, "code": ffmpeg_proc.returncode}), flush=True)
                    break

    elif action == 'stop':
        result = stop()
        print(json.dumps(result), flush=True)
