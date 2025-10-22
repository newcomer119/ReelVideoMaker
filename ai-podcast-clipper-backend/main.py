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
from google import genai

import pysubs2
from tqdm import tqdm
import whisperx


class ProcessVideoRequest(BaseModel):
    s3_key: str


image = (modal.Image.from_registry(
    "nvidia/cuda:12.4.0-devel-ubuntu22.04", add_python="3.12")
    .apt_install(["ffmpeg", "libgl1-mesa-glx", "wget", "libcudnn8", "libcudnn8-dev"])
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
    # Create vertical video directory
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Check if input files exist
    print(f"Checking input video: {input_video_path}")
    print(f"Input video exists: {os.path.exists(input_video_path)}")
    print(f"Checking audio: {audio_path}")
    print(f"Audio exists: {os.path.exists(audio_path)}")
    
    # Simple vertical conversion using FFmpeg
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

    # Filter segments that overlap with our clip
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

    # Process each segment
    for segment in clip_segments:
        # Check if this segment has word-level data
        if "words" in segment and segment["words"]:
            # Process word by word
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
            # Fallback: use segment-level data
            text = segment.get("text", "").strip()
            seg_start = segment.get("start")
            seg_end = segment.get("end")

            if not text or seg_start is None or seg_end is None:
                continue

            start_rel = max(0.0, seg_start - clip_start)
            end_rel = max(0.0, seg_end - clip_start)

            if end_rel <= 0:
                continue

            # Split text into words for subtitle grouping
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

    # Check if we have any subtitles to add
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
        # Fallback: copy original video without subtitles
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

    # Segment Path : Original Clip from start to end
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

    # Create vertical video immediately after cutting segment
    print(f"Creating vertical video immediately with:")
    print(f"  clip_segment_path: {clip_segment_path}")
    print(f"  audio_path: {audio_path}")
    print(f"  vertical_mp4_path: {vertical_mp4_path}")
    print(f"  clip_segment_path exists: {clip_segment_path.exists()}")
    print(f"  audio_path exists: {audio_path.exists()}")
    
    create_basic_vertical_video(str(clip_segment_path), str(audio_path), vertical_mp4_path)

    # Create subtitled version
    create_subtitles_with_ffmpeg(transcript_segments, start_time, end_time, str(vertical_mp4_path), str(substitute_output_path), max_words=5)
    
    # Return the subtitled version instead of the basic vertical video
    return substitute_output_path


@app.cls(gpu="L40S", timeout=900, retries=0, scaledown_window=20, secrets=[modal.Secret.from_name("custom-secret")], volumes={mount_path: volume})
class AiPodcastClipper:
    @modal.enter()
    def load_model(self):
        self.whisperx_model = whisperx.load_model("large-v2", device="cuda", compute_type="float16")
        self.alignment_model, self.metadata = whisperx.load_align_model(language_code="en", device="cuda")
        self.gemini_client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])



    def transcribe_video(self, base_dir: str, video_path: str) -> str:
        base_dir_path = pathlib.Path(base_dir)
        audio_path = base_dir_path / "audio.wav"
        
        # First, check if the video has an audio stream
        probe_cmd = f"ffprobe -v quiet -select_streams a -show_entries stream=codec_type -of csv=p=0 {video_path}"
        probe_result = subprocess.run(probe_cmd, shell=True, capture_output=True, text=True)
        
        if probe_result.returncode != 0 or not probe_result.stdout.strip():
            # Create a silent audio track with the same duration as the video
            duration_cmd = f"ffprobe -v quiet -show_entries format=duration -of csv=p=0 {video_path}"
            duration_result = subprocess.run(duration_cmd, shell=True, capture_output=True, text=True)
            duration = float(duration_result.stdout.strip()) if duration_result.returncode == 0 else 0
            
            # Create silent audio with the video duration
            extract_cmd = f"ffmpeg -f lavfi -i anullsrc=channel_layout=mono:sample_rate=16000 -t {duration} -acodec pcm_s16le -ar 16000 -ac 1 {audio_path}"
        else:
            # Extract audio from video
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
        # Extract only the segments with start/end times for the AI
        segments_data = []
        for segment in transcript:
            segments_data.append({
                "start": segment["start"],
                "end": segment["end"], 
                "text": segment["text"]
            })
        
        response = self.gemini_client.models.generate_content(model="gemini-2.0-flash-exp", contents=f"""
This is a podcast video transcript. I need to create clips between 30-60 seconds long.

Find interesting moments, stories, or Q&A segments from this transcript.

Rules:
- Return ONLY JSON format: [{{"start": seconds, "end": seconds}}, ...]
- Clips should be 30-60 seconds long
- No overlapping clips
- Use exact timestamps from the transcript
- Return empty list [] if no good clips found

Transcript segments:
{segments_data}

Return only the JSON array:""")
        return response.text      
        

    @modal.fastapi_endpoint(method="POST")
    def process_video(self,request:ProcessVideoRequest,token:HTTPAuthorizationCredentials = Depends(auth_scheme)):
        s3_key = request.s3_key

        if token.credentials != os.environ["AUTH_TOKEN"]:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect bearer token", headers={"WWW-Authenticate": "Bearer"})
        
        run_id = str(uuid.uuid4())
        base_dir = pathlib.Path("/tmp") / run_id
        base_dir.mkdir(parents=True,exist_ok=True)

        #Download the file 
        video_path = base_dir / "input.mp4"
        s3_client = boto3.client(
            "s3",
            aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
            region_name=os.environ.get("AWS_DEFAULT_REGION", "eu-north-1")
        )
        
        
        try:
            # First, check if the object exists
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

        transcript_result = self.transcribe_video(str(base_dir), str(video_path))
        transcript_segments = transcript_result.get("segments", [])

        #2 Identify the Raw Moments From the file 
        print(f"Transcript segments count: {len(transcript_segments)}")
        print(f"First few segments: {transcript_segments[:2] if transcript_segments else 'No segments'}")
        
        identified_moments_raw = self.identify_moments(transcript_segments)
        print(f"AI response: {identified_moments_raw}")

        cleaning_json_string = identified_moments_raw.strip()
        if cleaning_json_string.startswith("```json"):
            cleaning_json_string = cleaning_json_string[len("```json"):].strip()
        if cleaning_json_string.endswith("```"):
            cleaning_json_string = cleaning_json_string[:-len("```")]
        
        try:
            clip_moments = json.loads(cleaning_json_string)
            print(f"Successfully parsed JSON: {clip_moments}")
            if not clip_moments or not isinstance(clip_moments, list):
                print("Clip moments is empty or not a list")
                clip_moments = []
        except json.JSONDecodeError as e:
            print(f"JSON parsing failed: {e}")
            print(f"Cleaned JSON string: {cleaning_json_string}")
            clip_moments = []

        #3 Process Clips
        print(f"Processing {len(clip_moments)} clips")
        generated_videos = []
        s3_client = boto3.client(
            "s3",
            aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
            region_name=os.environ.get("AWS_DEFAULT_REGION", "eu-north-1")
        )
        
        for index, moment in enumerate(clip_moments[:1]):
            print(f"Processing clip {index}: {moment}")
            if "start" in moment and "end" in moment:
                print(f"Starting clip processing for moment {moment['start']} to {moment['end']}")
                vertical_video_path = process_clip(str(base_dir), str(video_path), s3_key, index, moment["start"], moment["end"], transcript_segments)
                
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
                            "video_url": video_url
                        })
                        print(f"Uploaded clip {index} to S3: {video_url}")
            else:
                print(f"Skipping invalid moment: {moment}")

        if base_dir.exists():
            shutil.rmtree(base_dir, ignore_errors=True)
        
        return {
            "status": "success", 
            "clips_processed": len(generated_videos),
            "generated_videos": generated_videos
        }




    

@app.local_entrypoint()
def main():
    import requests

    ai_podcast_clipper = AiPodcastClipper()

    url = ai_podcast_clipper.process_video.web_url

    payload = {
        "s3_key" : "test1/mi65min.mp4"
    }

    headers = {
        "Content-Type" : "application/json",
        "Authorization" : "Bearer 123123"
    }

    response = requests.post(url, json=payload, headers=headers)

    response.raise_for_status()
    result = response.json()
    print(result)
