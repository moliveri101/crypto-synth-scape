import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { satelliteId } = await req.json();
    
    if (!satelliteId) {
      return new Response(
        JSON.stringify({ error: 'Satellite ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('N2YO_API_KEY');
    const observerLat = 41.702;
    const observerLng = -86.238;
    const observerAlt = 0;
    const seconds = 1;

    const url = `https://api.n2yo.com/rest/v1/satellite/positions/${satelliteId}/${observerLat}/${observerLng}/${observerAlt}/${seconds}/&apikey=${apiKey}`;
    
    console.log('Fetching satellite data for:', satelliteId);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error('N2YO API error:', response.status, response.statusText);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch satellite data' }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    
    if (!data.positions || data.positions.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No satellite data found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const position = data.positions[0];
    
    const satelliteData = {
      name: data.info.satname,
      id: data.info.satid,
      altitude: position.sataltitude,
      latitude: position.satlatitude,
      longitude: position.satlongitude,
      timestamp: position.timestamp,
      azimuth: position.azimuth,
      elevation: position.elevation,
      ra: position.ra,
      dec: position.dec
    };

    console.log('Satellite data fetched successfully:', satelliteData.name);

    return new Response(
      JSON.stringify(satelliteData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in fetch-satellite-data:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
