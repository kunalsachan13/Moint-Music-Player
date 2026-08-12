"""
Moint Music Player - YouTube Music API & Community Song Sharing Backend
"""

import os
import json
import uuid
import time
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from ytmusicapi import YTMusic
from werkzeug.utils import secure_filename

app = Flask(__name__)
CORS(app)

BASE_DIR = '/tmp' if os.environ.get('VERCEL') else os.path.dirname(__file__)
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50 MB max per file

USERS_FILE = os.path.join(BASE_DIR, 'users.json')
COMMUNITY_FILE = os.path.join(BASE_DIR, 'community_songs.json')


def load_json(path, default):
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return default
    return default


def save_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


# Initialize YTMusic
auth_file = 'oauth.json' if os.path.exists('oauth.json') else ('browser.json' if os.path.exists('browser.json') else None)
try:
    if auth_file:
        yt = YTMusic(auth_file)
        print(f"[*] YTMusic initialized with authentication ({auth_file})")
    else:
        yt = YTMusic()
        print("[*] YTMusic initialized in unauthenticated mode")
except Exception as e:
    yt = YTMusic()
    print(f"[!] YTMusic fallback unauthenticated mode: {e}")


# --- YTMusic Endpoints ---
@app.route('/api/search', methods=['GET'])
def search():
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify([])

    try:
        results = yt.search(query, filter='songs')
        tracks = []
        for item in results:
            video_id = item.get('videoId')
            if not video_id:
                continue

            thumbs = item.get('thumbnails', [])
            art = thumbs[-1]['url'] if thumbs else f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"
            if 'w60-h60' in art:
                art = art.replace('w60-h60', 'w500-h500').replace('w120-h120', 'w500-h500')

            artists_list = item.get('artists', [])
            artist_name = ", ".join([a.get('name', '') for a in artists_list if a.get('name')]) if isinstance(artists_list, list) else "YouTube Music"

            tracks.append({
                'id': f'yt-{video_id}',
                'ytId': video_id,
                'title': item.get('title', 'Unknown Title'),
                'artist': artist_name or 'YouTube Music',
                'album': item.get('album', {}).get('name', 'YouTube Music') if isinstance(item.get('album'), dict) else 'YouTube Music',
                'art': art,
                'duration': item.get('duration_seconds') or 210,
                'isYt': True,
                'badge': 'YT Music'
            })

        return jsonify(tracks)
    except Exception as e:
        print(f"[!] Search error: {e}")
        return jsonify({'error': str(e)}), 500


# --- Authentication & User Profile Endpoints ---
@app.route('/api/auth/phone-login', methods=['POST'])
def phone_login():
    data = request.json or {}
    phone = data.get('phone', '').strip()
    name = data.get('name', '').strip() or f"User {phone[-4:] if len(phone)>=4 else 'Moint'}"

    if not phone:
        return jsonify({'error': 'Phone number is required'}), 400

    users = load_json(USERS_FILE, {})
    user_id = f"user_phone_{phone}"

    if user_id not in users:
        users[user_id] = {
            'id': user_id,
            'name': name,
            'phone': phone,
            'email': '',
            'bio': 'Music Lover on Moint 🎵',
            'avatar': f"https://api.dicebear.com/7.x/bottts/svg?seed={user_id}",
            'joinedAt': int(time.time())
        }
        save_json(USERS_FILE, users)

    return jsonify(users[user_id])


@app.route('/api/auth/google-login', methods=['POST'])
def google_login():
    data = request.json or {}
    email = data.get('email', '').strip()
    name = data.get('name', '').strip() or 'Google User'
    avatar = data.get('avatar', '').strip()

    if not email:
        return jsonify({'error': 'Email is required'}), 400

    users = load_json(USERS_FILE, {})
    user_id = f"user_google_{email.replace('@', '_at_').replace('.', '_')}"

    if user_id not in users:
        users[user_id] = {
            'id': user_id,
            'name': name,
            'email': email,
            'phone': '',
            'bio': 'Listening on Moint Music 🎧',
            'avatar': avatar or f"https://api.dicebear.com/7.x/avataaars/svg?seed={name}",
            'joinedAt': int(time.time())
        }
    else:
        if name: users[user_id]['name'] = name
        if avatar: users[user_id]['avatar'] = avatar

    save_json(USERS_FILE, users)
    return jsonify(users[user_id])


@app.route('/api/auth/update-profile', methods=['POST'])
def update_profile():
    data = request.json or {}
    user_id = data.get('userId')
    if not user_id:
        return jsonify({'error': 'userId required'}), 400

    users = load_json(USERS_FILE, {})
    if user_id not in users:
        return jsonify({'error': 'User not found'}), 404

    user = users[user_id]
    if 'name' in data and data['name'].strip():
        user['name'] = data['name'].strip()
    if 'bio' in data:
        user['bio'] = data['bio'].strip()
    if 'avatar' in data and data['avatar'].strip():
        user['avatar'] = data['avatar'].strip()

    save_json(USERS_FILE, users)
    return jsonify(user)


# --- Custom Community Song Uploads Endpoints ---
@app.route('/uploads/<path:filename>', methods=['GET'])
def serve_upload(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)


@app.route('/api/community/upload', methods=['POST'])
def upload_community_song():
    if 'audio' not in request.files:
        return jsonify({'error': 'Audio file is required'}), 400

    audio_file = request.files['audio']
    if audio_file.filename == '':
        return jsonify({'error': 'No selected audio file'}), 400

    title = request.form.get('title', '').strip() or os.path.splitext(audio_file.filename)[0]
    artist = request.form.get('artist', '').strip() or 'Community Artist'
    uploader_name = request.form.get('uploaderName', '').strip() or 'Anonymous User'
    uploader_id = request.form.get('uploaderId', '').strip() or 'anon'

    # Save audio file
    file_id = uuid.uuid4().hex
    audio_ext = os.path.splitext(audio_file.filename)[1].lower() or '.mp3'
    audio_filename = f"{file_id}{audio_ext}"
    audio_path = os.path.join(app.config['UPLOAD_FOLDER'], audio_filename)
    audio_file.save(audio_path)

    # Save art file if provided
    art_url = ''
    if 'art' in request.files and request.files['art'].filename != '':
        art_file = request.files['art']
        art_ext = os.path.splitext(art_file.filename)[1].lower() or '.jpg'
        art_filename = f"{file_id}_art{art_ext}"
        art_path = os.path.join(app.config['UPLOAD_FOLDER'], art_filename)
        art_file.save(art_path)
        art_url = f"http://localhost:5000/uploads/{art_filename}"

    # Build song object
    song_url = f"http://localhost:5000/uploads/{audio_filename}"
    new_song = {
        'id': f"custom-{file_id}",
        'title': title,
        'artist': artist,
        'album': f"Uploaded by {uploader_name}",
        'art': art_url,
        'audioUrl': song_url,
        'duration': 180,  # Will auto-update on load in player
        'uploaderId': uploader_id,
        'uploaderName': uploader_name,
        'uploadedAt': int(time.time()),
        'isOnline': True,
        'badge': 'Community'
    }

    community_songs = load_json(COMMUNITY_FILE, [])
    community_songs.insert(0, new_song)
    save_json(COMMUNITY_FILE, community_songs)

    return jsonify(new_song)


@app.route('/api/community/songs', methods=['GET'])
def get_community_songs():
    community_songs = load_json(COMMUNITY_FILE, [])
    return jsonify(community_songs)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"[*] Moint YTMusic & Community API Server running on http://localhost:{port}")
    app.run(host='0.0.0.0', port=port, debug=False)
