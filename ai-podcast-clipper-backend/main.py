import glob
import json
import pathlib
import pickle
import shutil
import subprocess
import time
import uuid
import boto3
import cv2
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import ffmpegcv
import modal
import numpy as np
from pydantic import BaseModel
import os
try:
    from openai import OpenAI
except ImportError:
    OpenAI = None  # Will be available in Modal environment

import pysubs2
from tqdm import tqdm
import whisperx


class ProcessVideoRequest(BaseModel):
    s3_key: str


image = (modal.Image.from_registry(
    "nvidia/cuda:12.4.0-devel-ubuntu22.04", add_python="3.12")
    .apt_install(["ffmpeg", "libgl1-mesa-glx", "wget", "libcudnn8", "libcudnn8-dev", "pkg-config", "libavcodec-dev", "libavformat-dev", "libswscale-dev", "libavdevice-dev", "libavfilter-dev", "libavutil-dev", "libswresample-dev", "build-essential", "clang"])
    .pip_install_from_requirements("requirements.txt")
    .run_commands(["mkdir -p /usr/share/fonts/truetype/custom",
                   "wget -O /usr/share/fonts/truetype/custom/Anton-Regular.ttf https://github.com/google/fonts/raw/main/ofl/anton/Anton-Regular.ttf",
                   "fc-cache -f -v"])
    .add_local_dir("asd", "/asd", copy=True))

app = modal.App("ai-podcast-clipper", image=image)

volume = modal.Volume.from_name(
    "ai-podcast-clipper-model-cache", create_if_missing=True
)

mount_path = "/root/.cache/torch/"

auth_scheme = HTTPBearer()

def create_vertical_video(tracks, scores, pyframes_path, pyavi_path, audio_path, output_path, framerate=25):
    target_width = 1080
    target_height = 1920

    flist = glob.glob(os.path.join(str(pyframes_path), "*.jpg"))
    flist.sort()

    faces = [[] for _ in range(len(flist))]

    for tidx, track in enumerate(tracks):
        score_array = scores[tidx]
        for fidx, frame in enumerate(track["track"]["frame"].tolist()):
            slice_start = max(fidx - 30, 0)
            slice_end = min(fidx + 30, len(score_array))
            score_slice = score_array[slice_start:slice_end]
            avg_score = float(np.mean(score_slice)
                              if len(score_slice) > 0 else 0)

            faces[frame].append(
                {'track': tidx, 'score': avg_score, 's': track['proc_track']["s"][fidx], 'x': track['proc_track']["x"][fidx], 'y': track['proc_track']["y"][fidx]})

    temp_video_path = os.path.join(str(pyavi_path), "video_only.mp4")

    vout = None
    for fidx, fname in tqdm(enumerate(flist), total=len(flist), desc="Creating vertical video"):
        img = cv2.imread(fname)
        if img is None:
            continue

        current_faces = faces[fidx]

        max_score_face = max(
            current_faces, key=lambda face: face['score']) if current_faces else None

        if max_score_face and max_score_face['score'] < 0:
            max_score_face = None

        if vout is None:
            vout = ffmpegcv.VideoWriterNV(
                file=temp_video_path,
                codec=None,
                fps=framerate,
                resize=(target_width, target_height)
            )

        if max_score_face:
            mode = "crop"
        else:
            mode = "resize"

        if mode == "resize":
            scale = target_width / img.shape[1]
            resized_height = int(img.shape[0] * scale)
            resized_image = cv2.resize(
                img, (target_width, resized_height), interpolation=cv2.INTER_AREA)

            scale_for_bg = max(
                target_width / img.shape[1], target_height / img.shape[0])
            bg_width = int(img.shape[1] * scale_for_bg)
            bg_heigth = int(img.shape[0] * scale_for_bg)

            blurred_background = cv2.resize(img, (bg_width, bg_heigth))
            blurred_background = cv2.GaussianBlur(
                blurred_background, (121, 121), 0)

            crop_x = (bg_width - target_width) // 2
            crop_y = (bg_heigth - target_height) // 2
            blurred_background = blurred_background[crop_y:crop_y +
                                                    target_height, crop_x:crop_x + target_width]

            center_y = (target_height - resized_height) // 2
            blurred_background[center_y:center_y +
                               resized_height, :] = resized_image

            vout.write(blurred_background)

        elif mode == "crop":
            scale = target_height / img.shape[0]
            resized_image = cv2.resize(
                img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
            frame_width = resized_image.shape[1]

            center_x = int(
                max_score_face["x"] * scale if max_score_face else frame_width // 2)
            top_x = max(min(center_x - target_width // 2,
                        frame_width - target_width), 0)

            image_cropped = resized_image[0:target_height,
                                          top_x:top_x + target_width]

            vout.write(image_cropped)

    if vout:
        vout.release()

    ffmpeg_command = (f"ffmpeg -y -i {temp_video_path} -i {str(audio_path)} "
                      f"-c:v h264 -preset fast -crf 23 -c:a aac -b:a 128k "
                      f"{str(output_path)}")
    subprocess.run(ffmpeg_command, shell=True, check=True, text=True)

def create_basic_vertical_video(input_video_path, audio_path, output_path):
    """Create a basic vertical video when Columbia script fails"""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    print(f"Checking input video: {input_video_path}")
    print(f"Input video exists: {os.path.exists(input_video_path)}")
    print(f"Checking audio: {audio_path}")
    print(f"Audio exists: {os.path.exists(audio_path)}")
    
    vertical_cmd = (f"ffmpeg -y -i {input_video_path} -i {audio_path} "
                   f"-vf 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2' "
                   f"-c:v h264 -preset fast -crf 23 -c:a aac -b:a 128k "
                   f"{output_path}")
    
    print(f"Running vertical video command: {vertical_cmd}")
    result = subprocess.run(vertical_cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Basic vertical video creation failed: {result.stderr}")
        print(f"FFmpeg stdout: {result.stdout}")
    else:
        print(f"Basic vertical video created: {output_path}")

def upload_to_s3(file_path, s3_key, s3_client):
    """Upload file to S3 and return the URL"""
    try:
        s3_client.upload_file(str(file_path), "ai-podcast-clipper11", s3_key)
        return f"https://ai-podcast-clipper11.s3.eu-north-1.amazonaws.com/{s3_key}"
    except Exception as e:
        print(f"S3 upload failed: {e}")
        return None


def create_subtitles_with_ffmpeg(transcript_segments: list, clip_start: float, clip_end: float, clip_video_path: str, output_path: str, max_words: int = 5):
    temp_dir = os.path.dirname(output_path)
    os.makedirs(temp_dir, exist_ok=True)
    subtitle_path = os.path.join(temp_dir, "temp_subtitles.ass")

    clip_segments = [segment for segment in transcript_segments
                     if segment.get("start") is not None
                     and segment.get("end") is not None
                     and segment.get("end") > clip_start
                     and segment.get("start") < clip_end
                     ]

    subtitles = []
    current_words = []
    current_start = None
    current_end = None

    for segment in clip_segments:
        if "words" in segment and segment["words"]:
            for word_data in segment["words"]:
                word = word_data.get("word", "").strip()
                word_start = word_data.get("start")
                word_end = word_data.get("end")

                if not word or word_start is None or word_end is None:
                    continue

                start_rel = max(0.0, word_start - clip_start)
                end_rel = max(0.0, word_end - clip_start)

                if end_rel <= 0:
                    continue

                if not current_words:
                    current_start = start_rel
                    current_end = end_rel
                    current_words = [word]
                elif len(current_words) >= max_words:
                    subtitles.append(
                        (current_start, current_end, ' '.join(current_words)))
                    current_words = [word]
                    current_start = start_rel
                    current_end = end_rel
                else:
                    current_words.append(word)
                    current_end = end_rel
        else:
            text = segment.get("text", "").strip()
            seg_start = segment.get("start")
            seg_end = segment.get("end")

            if not text or seg_start is None or seg_end is None:
                continue

            start_rel = max(0.0, seg_start - clip_start)
            end_rel = max(0.0, seg_end - clip_start)

            if end_rel <= 0:
                continue

            words = text.split()
            for i, word in enumerate(words):
                if not current_words:
                    current_start = start_rel
                    current_end = end_rel
                    current_words = [word]
                elif len(current_words) >= max_words:
                    subtitles.append(
                        (current_start, current_end, ' '.join(current_words)))
                    current_words = [word]
                    current_start = start_rel
                    current_end = end_rel
                else:
                    current_words.append(word)
                    current_end = end_rel

    if current_words:
        subtitles.append(
            (current_start, current_end, ' '.join(current_words)))

    subs = pysubs2.SSAFile()

    subs.info["WrapStyle"] = 0
    subs.info["ScaledBorderAndShadow"] = "yes"
    subs.info["PlayResX"] = 1080
    subs.info["PlayResY"] = 1920
    subs.info["ScriptType"] = "v4.00+"

    style_name = "Default"
    new_style = pysubs2.SSAStyle()
    new_style.fontname = "Anton"
    new_style.fontsize = 140
    new_style.primarycolor = pysubs2.Color(255, 255, 255)
    new_style.outline = 2.0
    new_style.shadow = 2.0
    new_style.shadowcolor = pysubs2.Color(0, 0, 0, 128)
    new_style.alignment = 2
    new_style.marginl = 50
    new_style.marginr = 50
    new_style.marginv = 50
    new_style.spacing = 0.0

    subs.styles[style_name] = new_style

    for i, (start, end, text) in enumerate(subtitles):
        start_time = pysubs2.make_time(s=start)
        end_time = pysubs2.make_time(s=end)
        line = pysubs2.SSAEvent(
            start=start_time, end=end_time, text=text, style=style_name)
        subs.events.append(line)

    subs.save(subtitle_path)

    if not subtitles:
        print("No subtitles to add, copying original video")
        shutil.copy(clip_video_path, output_path)
        return

    print(f"Creating subtitled video with {len(subtitles)} subtitle segments")
    ffmpeg_cmd = (f"ffmpeg -y -i {clip_video_path} -vf \"ass={subtitle_path}\" "
                  f"-c:v h264 -preset fast -crf 23 -c:a copy {output_path}")

    print(f"Running subtitle command: {ffmpeg_cmd}")
    result = subprocess.run(ffmpeg_cmd, shell=True, capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"Subtitle creation failed: {result.stderr}")
        print(f"FFmpeg stdout: {result.stdout}")
        print("Falling back to original video without subtitles")
        shutil.copy(clip_video_path, output_path)
    else:
        print(f"Subtitled video created: {output_path}")

def process_clip(base_dir: str, orignal_video_path: str, s3_key: str, clip_index: int, start_time: float, end_time: float, transcript_segments: list):
    print(f"=== PROCESSING CLIP {clip_index} ===")
    print(f"Start time: {start_time}, End time: {end_time}")
    
    clip_name = f"clip_{clip_index}"
    s3_key_dir = os.path.dirname(s3_key)
    output_s3_key = f"{s3_key_dir}/{clip_name}.mp4"

    base_dir_path = pathlib.Path(base_dir)
    clip_dir = base_dir_path / clip_name
    clip_dir.mkdir(parents=True, exist_ok=True)

    clip_segment_path = clip_dir / f"{clip_name}_segment.mp4"
    vertical_mp4_path = clip_dir / "pyavi" / "video_out_vertical.mp4"
    substitute_output_path = clip_dir / "pyavi" / "video_with_subtitles.mp4"

    (clip_dir / "pywork").mkdir(exist_ok=True)
    pyframes_path = clip_dir / "pyframes"
    pyavi_path = clip_dir / "pyavi" / "audio-wav"

    pyframes_path.mkdir(parents=True, exist_ok=True)
    pyavi_path.mkdir(parents=True, exist_ok=True)

    duration = end_time - start_time
    cut_command = f"ffmpeg -y -i {orignal_video_path} -ss {start_time} -t {duration} -c copy {clip_segment_path}"
    print(f"Cutting video with command: {cut_command}")
    result = subprocess.run(cut_command, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Video cutting failed: {result.stderr}")
        return None
    print(f"Video segment created: {clip_segment_path}")

    audio_path = clip_dir / "audio.wav"
    extract_audio_cmd = f"ffmpeg -y -i {clip_segment_path} -vn -acodec pcm_s16le -ar 16000 -ac 1 {audio_path}"
    print(f"Extracting audio with command: {extract_audio_cmd}")
    result = subprocess.run(extract_audio_cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Audio extraction failed: {result.stderr}")
        return None
    print(f"Audio extracted: {audio_path}")

    shutil.copy(clip_segment_path, base_dir_path / f"{clip_name}.mp4")

    print(f"Creating vertical video immediately with:")
    print(f"  clip_segment_path: {clip_segment_path}")
    print(f"  audio_path: {audio_path}")
    print(f"  vertical_mp4_path: {vertical_mp4_path}")
    print(f"  clip_segment_path exists: {clip_segment_path.exists()}")
    print(f"  audio_path exists: {audio_path.exists()}")
    
    create_basic_vertical_video(str(clip_segment_path), str(audio_path), vertical_mp4_path)

    create_subtitles_with_ffmpeg(transcript_segments, start_time, end_time, str(vertical_mp4_path), str(substitute_output_path), max_words=5)
    
    return substitute_output_path


@app.cls(gpu="L40S", timeout=900, retries=0, scaledown_window=20, secrets=[modal.Secret.from_name("custom-secret")], volumes={mount_path: volume})
class AiPodcastClipper:
    @modal.enter()
    def load_model(self):
        self.whisperx_model = whisperx.load_model("large-v2", device="cuda", compute_type="float16")
        self.alignment_model, self.metadata = whisperx.load_align_model(language_code="en", device="cuda")
        
        # Replace Gemini with OpenAI for maximum reliability
        self.openai_client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    def transcribe_video(self, base_dir: str, video_path: str) -> str:
        base_dir_path = pathlib.Path(base_dir)
        audio_path = base_dir_path / "audio.wav"
        
        probe_cmd = f"ffprobe -v quiet -select_streams a -show_entries stream=codec_type -of csv=p=0 {video_path}"
        probe_result = subprocess.run(probe_cmd, shell=True, capture_output=True, text=True)
        
        if probe_result.returncode != 0 or not probe_result.stdout.strip():
            duration_cmd = f"ffprobe -v quiet -show_entries format=duration -of csv=p=0 {video_path}"
            duration_result = subprocess.run(duration_cmd, shell=True, capture_output=True, text=True)
            duration = float(duration_result.stdout.strip()) if duration_result.returncode == 0 else 0
            
            extract_cmd = f"ffmpeg -f lavfi -i anullsrc=channel_layout=mono:sample_rate=16000 -t {duration} -acodec pcm_s16le -ar 16000 -ac 1 {audio_path}"
        else:
            extract_cmd = f"ffmpeg -i {video_path} -vn -acodec pcm_s16le -ar 16000 -ac 1 {audio_path}"
        
        result = subprocess.run(extract_cmd, shell=True, capture_output=True, text=True)
        
        if result.returncode != 0:
            raise RuntimeError(f"Failed to extract audio: {result.stderr}")
        
        if not audio_path.exists():
            raise RuntimeError(f"Audio file was not created: {audio_path}")
        
        start_time = time.time()

        audio = whisperx.load_audio(str(audio_path))
        result = self.whisperx_model.transcribe(audio, batch_size=16)

        result = whisperx.align(
            result["segments"],
            self.alignment_model,
            self.metadata,
            audio,
            device="cuda",
            return_char_alignments=False
        )
        duration = time.time() - start_time
        return result

    def identify_moments(self, transcript: dict):
        """Use OpenAI GPT-4o with function calling for maximum reliability"""
        
        # Extract segments
        segments_data = []
        for segment in transcript:
            segments_data.append({
                "start": segment["start"],
                "end": segment["end"], 
                "text": segment["text"]
            })
        
        print(f"Analyzing {len(segments_data)} transcript segments with GPT-4o...")
        
        # Define function schema for structured output
        tools = [
            {
                "type": "function",
                "function": {
                    "name": "identify_podcast_clips",
                    "description": "Identify the most viral and engaging moments from ANY video content (gaming, podcasts, tutorials, entertainment) that would make great social media clips",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "clips": {
                                "type": "array",
                                "description": "Array of identified clip moments",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "start": {
                                            "type": "number",
                                            "description": "Start time in seconds (must match exact timestamp from transcript)"
                                        },
                                        "end": {
                                            "type": "number",
                                            "description": "End time in seconds (must match exact timestamp from transcript)"
                                        },
                                        "reason": {
                                            "type": "string",
                                            "description": "Why this moment would make a great clip (funny, insightful, controversial, emotional, etc.)"
                                        },
                                        "hook": {
                                            "type": "string",
                                            "description": "Catchy title/hook for social media (under 60 characters)"
                                        },
                                        "virality_score": {
                                            "type": "integer",
                                            "description": "Predicted virality score from 1-10",
                                            "minimum": 1,
                                            "maximum": 10
                                        }
                                    },
                                    "required": ["start", "end", "reason", "hook", "virality_score"]
                                }
                            }
                        },
                        "required": ["clips"]
                    }
                }
            }
        ]
        
        try:
            response = self.openai_client.chat.completions.create(
                model="gpt-4o",  # Most reliable model
                messages=[
                                         {
                         "role": "system",
                         "content": """You are an expert at identifying viral moments from ANY video content for social media clips (TikTok, Instagram Reels, YouTube Shorts).

Your goal: Find the most engaging 3-10 moments that will get views, shares, and engagement.

Find clips that are:
- 30-60 seconds long (STRICT requirement)
- Self-contained (no context needed)
- Hook viewers in the first 2 seconds
- Have a clear payoff, climax, or emotional beat

CONTENT TYPES TO HANDLE:

Gaming/Streaming Content:
- Epic plays, perfect executions, insane kills
- Funny fails and unexpected outcomes
- Intense reactions (excitement, anger, shock)
- Clutch moments and comebacks
- Jokes and funny commentary during gameplay

Podcast/Interview Content:
- Controversial hot takes
- Emotional personal stories
- Surprising revelations or "Aha!" moments
- Actionable life advice
- Funny banter and timing

Educational/How-To:
- Pro tips and hacks that feel like secrets
- Satisfying transformations or results
- "Wait, what?" counterintuitive facts
- Quick actionable takeaways

General Entertainment:
- Conflict, tension, or drama
- Surprising plot twists or reveals
- Emotional beats (happy/sad/funny)
- Catchy one-liners or quotes

AVOID at all costs:
- Boring setup or exposition
- Mid-conversation transitions
- Abstract philosophical discussions
- Moments requiring context or background knowledge
- Awkward pauses or dead air

CRITICAL: Only use exact start/end times from the provided transcript."""
                     },
                     {
                         "role": "user",
                         "content": f"Analyze this video transcript and identify the best viral moments:\n\n{json.dumps(segments_data, indent=2)}"
                     }
                ],
                tools=tools,
                tool_choice={"type": "function", "function": {"name": "identify_podcast_clips"}},
                temperature=0.3  # Lower for more consistent, reliable output
            )
            
            # Extract the function call
            tool_call = response.choices[0].message.tool_calls[0]
            clips_data = json.loads(tool_call.function.arguments)
            
            clips = clips_data.get("clips", [])
            print(f"GPT-4o identified {len(clips)} potential clips")
            
            # Validate and filter clips
            validated_clips = []
            for clip in clips:
                if "start" not in clip or "end" not in clip:
                    print(f"Skipping clip missing start/end: {clip.get('hook', 'Unknown')}")
                    continue
                
                duration = clip["end"] - clip["start"]
                
                # Require at least 30 seconds, max 60 seconds
                if duration < 30:
                    print(f"Skipping clip too short ({duration}s): {clip.get('hook')}")
                    continue
                elif duration > 60:
                    print(f"Skipping clip too long ({duration}s): {clip.get('hook')}")
                    continue
                
                # Check for overlaps with already validated clips
                overlaps = False
                for validated in validated_clips:
                    if not (clip["end"] <= validated["start"] or clip["start"] >= validated["end"]):
                        print(f"Skipping overlapping clip: {clip.get('hook')}")
                        overlaps = True
                        break
                
                if not overlaps:
                    validated_clips.append(clip)
                    print(f"✓ Validated clip: {clip.get('hook')} ({duration:.1f}s, score: {clip.get('virality_score', 'N/A')})")
            
            # Sort by virality score
            validated_clips.sort(key=lambda x: x.get("virality_score", 0), reverse=True)
            
            print(f"Final validated clips: {len(validated_clips)}")
            return validated_clips
            
        except Exception as e:
            print(f"Error calling OpenAI API: {e}")
            print(f"Falling back to empty clip list")
            return []

    @modal.fastapi_endpoint(method="POST")
    def process_video(self, request: ProcessVideoRequest, token: HTTPAuthorizationCredentials = Depends(auth_scheme)):
        s3_key = request.s3_key

        if token.credentials != os.environ["AUTH_TOKEN"]:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect bearer token", headers={"WWW-Authenticate": "Bearer"})
        
        run_id = str(uuid.uuid4())
        base_dir = pathlib.Path("/tmp") / run_id
        base_dir.mkdir(parents=True, exist_ok=True)

        video_path = base_dir / "input.mp4"
        s3_client = boto3.client(
            "s3",
            aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
            region_name=os.environ.get("AWS_DEFAULT_REGION", "eu-north-1")
        )
        
        try:
            s3_client.head_object(Bucket="ai-podcast-clipper11", Key=s3_key)
            s3_client.download_file("ai-podcast-clipper11", s3_key, str(video_path))
            
        except s3_client.exceptions.NoSuchKey:
            raise HTTPException(status_code=404, detail=f"File {s3_key} not found in S3 bucket")
        except s3_client.exceptions.ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == '403':
                raise HTTPException(status_code=403, detail="Access denied to S3 bucket. Check permissions.")
            else:
                raise HTTPException(status_code=500, detail=f"S3 error: {error_code}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")

        # Transcribe video
        transcript_result = self.transcribe_video(str(base_dir), str(video_path))
        transcript_segments = transcript_result.get("segments", [])

        # Use OpenAI to identify moments (much more reliable than Gemini)
        print(f"Transcript segments count: {len(transcript_segments)}")
        clip_moments = self.identify_moments(transcript_segments)

        # Process clips
        print(f"Processing {len(clip_moments)} clips")
        generated_videos = []
        
        for index, moment in enumerate(clip_moments[:5]):  # Process top 5 clips
            print(f"\n{'='*60}")
            print(f"Processing clip {index + 1}/{len(clip_moments)}")
            print(f"Hook: {moment.get('hook')}")
            print(f"Reason: {moment.get('reason')}")
            print(f"Time: {moment['start']:.1f}s - {moment['end']:.1f}s")
            print(f"Virality Score: {moment.get('virality_score')}/10")
            print(f"{'='*60}\n")
            
            vertical_video_path = process_clip(
                str(base_dir), 
                str(video_path), 
                s3_key, 
                index, 
                moment["start"], 
                moment["end"], 
                transcript_segments
            )
            
            # Upload to S3
            if vertical_video_path and vertical_video_path.exists():
                s3_key_dir = os.path.dirname(s3_key)
                clip_s3_key = f"{s3_key_dir}/clips/clip_{index}.mp4"
                video_url = upload_to_s3(vertical_video_path, clip_s3_key, s3_client)
                if video_url:
                    generated_videos.append({
                        "clip_index": index,
                        "start_time": moment["start"],
                        "end_time": moment["end"],
                        "duration": moment["end"] - moment["start"],
                        "hook": moment.get("hook", ""),
                        "reason": moment.get("reason", ""),
                        "virality_score": moment.get("virality_score", 0),
                        "video_url": video_url
                    })
                    print(f"✓ Uploaded clip {index} to S3: {video_url}")

        # Cleanup
        if base_dir.exists():
            shutil.rmtree(base_dir, ignore_errors=True)
        
        return {
            "status": "success", 
            "total_clips_identified": len(clip_moments),
            "clips_processed": len(generated_videos),
            "generated_videos": generated_videos
        }


@app.local_entrypoint()
def main():
    import requests

    ai_podcast_clipper = AiPodcastClipper()

    url = ai_podcast_clipper.process_video.web_url

    payload = {
        "s3_key": "test1/mi65min.mp4"
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer 123123"
    }

    response = requests.post(url, json=payload, headers=headers)

    response.raise_for_status()
    result = response.json()
    print(result)