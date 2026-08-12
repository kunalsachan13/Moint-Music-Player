"""
Moint Music Player - YouTube Music API & Community Song Sharing Backend
"""

import os
import json
import uuid
import time
from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS
from spotapi import Song, Public

BASE_DIR = '/tmp' if os.environ.get('VERCEL') else os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__)
CORS(app)
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


# Initialize Unofficial Spotify API Client (Aran404/SpotAPI)
try:
    spot_song = Song()
    spot_public = Public()
    print("[*] SpotAPI (Aran404/SpotAPI) initialized successfully!")
except Exception as e:
    spot_song = None
    spot_public = None
    print(f"[!] SpotAPI initialization warning: {e}")


# --- Spotify API Endpoints ---
@app.route('/api/search', methods=['GET'])
@app.route('/api/spotify/search', methods=['GET'])
def spotify_search():
    query = request.args.get('q', '').strip()
    limit = int(request.args.get('limit', 20))
    if not query:
        return jsonify([])

    tracks = []

    # 1. Try SpotAPI Song().query_songs()
    if spot_song:
        try:
            res = spot_song.query_songs(query, limit=limit)
            items = res.get('data', {}).get('searchV2', {}).get('tracksV2', {}).get('items', [])
            for item in items:
                data = item.get('item', {}).get('data', {})
                if not data or data.get('__typename') != 'Track':
                    continue

                track_id = data.get('id')
                title = data.get('name', 'Unknown Track')
                artist_items = data.get('artists', {}).get('items', [])
                artist_names = [a.get('profile', {}).get('name') for a in artist_items if a.get('profile', {}).get('name')]
                artist_name = ", ".join(artist_names) if artist_names else "Spotify Artist"
                album_data = data.get('albumOfTrack', {})
                album_name = album_data.get('name', 'Spotify Track')
                cover_sources = album_data.get('coverArt', {}).get('sources', [])
                art = cover_sources[0]['url'] if cover_sources else ''
                duration_ms = data.get('duration', {}).get('totalMilliseconds', 0)
                duration_sec = int(duration_ms / 1000) if duration_ms else 210

                tracks.append({
                    'id': f'spotify-{track_id}',
                    'spotifyId': track_id,
                    'title': title,
                    'artist': artist_name,
                    'album': album_name,
                    'art': art,
                    'duration': duration_sec,
                    'isSpotify': True,
                    'needsResolve': True,
                    'badge': 'Spotify'
                })
        except Exception as e:
            print(f"[!] SpotAPI query_songs notice: {e}")

    # 2. Fallback to spotapi Public().song_search() if empty
    if not tracks and spot_public:
        try:
            gen = spot_public.song_search(query)
            batch = next(gen, [])
            for wrapper in batch:
                data = wrapper.get('item', {}).get('data', {})
                if not data or data.get('__typename') != 'Track':
                    continue

                track_id = data.get('id')
                title = data.get('name', 'Unknown Track')
                artist_items = data.get('artists', {}).get('items', [])
                artist_names = [a.get('profile', {}).get('name') for a in artist_items if a.get('profile', {}).get('name')]
                artist_name = ", ".join(artist_names) if artist_names else "Spotify Artist"
                album_data = data.get('albumOfTrack', {})
                album_name = album_data.get('name', 'Spotify Track')
                cover_sources = album_data.get('coverArt', {}).get('sources', [])
                art = cover_sources[0]['url'] if cover_sources else ''
                duration_ms = data.get('duration', {}).get('totalMilliseconds', 0)
                duration_sec = int(duration_ms / 1000) if duration_ms else 210

                tracks.append({
                    'id': f'spotify-{track_id}',
                    'spotifyId': track_id,
                    'title': title,
                    'artist': artist_name,
                    'album': album_name,
                    'art': art,
                    'duration': duration_sec,
                    'isSpotify': True,
                    'needsResolve': True,
                    'badge': 'Spotify'
                })
        except Exception as e:
            print(f"[!] SpotAPI public search error: {e}")

    return jsonify(tracks)


# Global in-memory cache for Spotify public playlists
_spotify_playlists_cache = {
    'data': [],
    'timestamp': 0
}


@app.route('/api/spotify/playlists', methods=['GET'])
def get_spotify_playlists():
    global _spotify_playlists_cache
    now = time.time()
    # Cache for 15 minutes
    if _spotify_playlists_cache['data'] and (now - _spotify_playlists_cache['timestamp'] < 900):
        return jsonify(_spotify_playlists_cache['data'])

    spotify_playlist_configs = [
        {'id': '37i9dQZF1DXcBWIGoYBM5M', 'badge': 'TOP HITS', 'fallback_title': "Today's Top Hits 🌟"},
        {'id': '37i9dQZF1DWWQRwaw0UeBw', 'badge': 'LOFI', 'fallback_title': "Lofi Beats ☕"},
        {'id': '37i9dQZF1DX0XUfTFmBDM0', 'badge': 'BOLLYWOOD', 'fallback_title': "Hot Hits Hindi 🎬"},
        {'id': '37i9dQZF1DXdLENycTe12M', 'badge': 'SYNTH', 'fallback_title': "Retro Synthwave ⚡"},
        {'id': '37i9dQZF1DX76Wlfdnj7AP', 'badge': 'WORKOUT', 'fallback_title': "Beast Mode Workout 🏋️‍♂️"},
        {'id': '37i9dQZF1DX4E3UdUs7fUx', 'badge': 'ACOUSTIC', 'fallback_title': "Acoustic Favorites 🎸"}
    ]

    result_playlists = []
    from spotapi import PublicPlaylist

    for config in spotify_playlist_configs:
        pid = config['id']
        try:
            pl = PublicPlaylist(pid)
            info = pl.get_playlist_info()
            pdata = info.get('data', {}).get('playlistV2', {})
            title = pdata.get('name') or config['fallback_title']
            desc = pdata.get('description') or ''

            # Image
            images = pdata.get('images', {}).get('items', [])
            art = images[0]['sources'][0]['url'] if images and images[0].get('sources') else ''

            # Tracks
            contents = pdata.get('content', {}).get('items', [])
            tracks = []
            for track_item in contents:
                data = track_item.get('itemV2', {}).get('data', {}) or track_item.get('item', {}).get('data', {})
                if not data or data.get('__typename') != 'Track':
                    continue

                track_id = data.get('id') or (data.get('uri', '').split(':')[-1] if data.get('uri') else None)
                if not track_id:
                    continue

                name = data.get('name', 'Spotify Song')
                artist_items = data.get('artists', {}).get('items', [])
                artist_names = [a.get('profile', {}).get('name') for a in artist_items if a.get('profile', {}).get('name')]
                artist_name = ", ".join(artist_names) if artist_names else "Spotify Artist"
                album_data = data.get('albumOfTrack', {})
                album_name = album_data.get('name', 'Spotify Album')
                cover_sources = album_data.get('coverArt', {}).get('sources', [])
                cover_art = cover_sources[0]['url'] if cover_sources else art
                duration_ms = data.get('trackDuration', {}).get('totalMilliseconds', 0) or data.get('duration', {}).get('totalMilliseconds', 0)
                duration_sec = int(duration_ms / 1000) if duration_ms else 210

                tracks.append({
                    'id': f'spotify-{track_id}',
                    'spotifyId': track_id,
                    'title': name,
                    'artist': artist_name,
                    'album': album_name,
                    'art': cover_art,
                    'duration': duration_sec,
                    'isSpotify': True,
                    'needsResolve': True,
                    'badge': 'Spotify'
                })

            result_playlists.append({
                'id': f'spotify-pl-{pid}',
                'spotifyPlaylistId': pid,
                'title': title,
                'sub': f'{len(tracks)} Tracks • {desc[:60]}...' if desc else f'{len(tracks)} Tracks on Spotify',
                'badge': config['badge'],
                'art': art,
                'tracks': tracks
            })
        except Exception as e:
            print(f"[!] Error fetching Spotify playlist {pid}: {e}")

    if result_playlists:
        _spotify_playlists_cache['data'] = result_playlists
        _spotify_playlists_cache['timestamp'] = now

    return jsonify(result_playlists)


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


@app.route('/')
@app.route('/index.html')
def index():
    return send_file(os.path.join(BASE_DIR, 'index.html'))


@app.route('/<path:filename>')
def serve_static(filename):
    file_path = os.path.join(BASE_DIR, filename)
    if os.path.isfile(file_path):
        return send_file(file_path)
    return jsonify({'error': 'File not found'}), 404


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"[*] Moint YTMusic & Community API Server running on http://localhost:{port}")
    app.run(host='0.0.0.0', port=port, debug=False)
