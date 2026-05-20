async function getWeather(city) {
    const response = await fetch(`https://api.weatherapi.com/${city}`);
    return response.json();
}

module.exports = { getWeather };