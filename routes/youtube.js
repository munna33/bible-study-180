const express = require("express");
const axios = require("axios");
const router = express.Router();
const credentials = require("../config.js");
const YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3/search";
router.get("/latestVideos", (req, res) => {
  fetchPopularVideos(res);
});
async function fetchPopularVideos(res, region = "IN", maxResults = 5) {
  try {
    // const response = await axios.get(YOUTUBE_API_URL, {
    //   params: {
    //     part: 'snippet,contentDetails',
    //     order: 'viewCount',
    //     maxResults: maxResults,
    //     key: credentials.api_key,
    //     channelId: credentials.channel_id,
    //     forContentOwner:
    //   }
    // });
    const searchRes = await axios.get(YOUTUBE_API_URL, {
      params: {
        part: "snippet",
        order: "viewCount",
        type: "video",
        maxResults: maxResults,
        key: credentials.api_key,
        channelId: credentials.channel_id,
      },
    });


    const videoIds = searchRes.data.items
      .map((item) =>{
        return {
            ...item,
            videoId: item.id.videoId
        }
      });
   const results =  videoIds.filter(item => {
     return getVideoDetails(item);
    })
    res.json(results);
  } catch (error) {
    console.error(
      "Error fetching videos:",
      error.response?.data || error.message
    );
    res.json({});
  }
}

// Helper function to check if video is a Short (≤ 60 seconds)
function isShort(duration) {
  const regex = /PT(?:(\d+)M)?(?:(\d+)S)?/;
  const match = duration.match(regex);

  if (!match) return false;

  const minutes = parseInt(match[1] || "0", 10);
  const seconds = parseInt(match[2] || "0", 10);
  const totalSeconds = minutes * 60 + seconds;

  return totalSeconds <= 60;
}

async function getVideoDetails(videoIds) {
  const videoURL = "https://www.googleapis.com/youtube/v3/videos";

  const videoRes = await axios.get(videoURL, {
    params: {
      part: "snippet,contentDetails",
      id: videoIds.videoId,
      key: credentials.api_key,
    },
  });

  const videos = videoRes.data.items.map((video) => ({
    ...videoIds,
    title: video.snippet.title,
    id: video.id,
    duration: video.contentDetails.duration,
    // ISO 8601 format, e.g. "PT4M13S"
  }));

  const filteredVideos = videos.filter(video => {
      const duration = video.duration; // e.g., PT45S
      return !isShort(duration);
    });

  return filteredVideos;
}


module.exports = router;
