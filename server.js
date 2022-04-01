const http = require('http');
const fs = require('fs');
const url = require('url');

var config = require('./config.json'); //load configuration file
config.server.port = process.env.PORT || config.server.port

//const readingTypes = ['noiseReading', 'motionReading'];

const {InfluxDB, Point} = require('@influxdata/influxdb-client')
const client = new InfluxDB({url: config.influxDB.url, token: config.influxDB.token})

queryApi = client.getQueryApi(config.influxDB.org);

//send file to client, used for static content
function sendFile(fileLoc, res){
	const ext = fileLoc.split('.').pop();
	const stream = fs.createReadStream(fileLoc);
	stream.on('error', (err) => {
		res.writeHead(404, 'Not Found');
		res.end('404');
	});
	if(ext == 'js')res.setHeader('Content-Type', 'text/javascript');
	else if(ext == 'css')res.setHeader('Content-Type', 'text/css');
	else if(ext == 'svg')res.setHeader('Content-Type', 'image/svg+xml');
	else res.setHeader('Content-Type', 'text/html');
	stream.pipe(res);
}

//called too send error response to client
function send400err(str, res){
	res.setHeader('Content-Type', 'text/plain');
	res.writeHead(400, 'error');
	res.end(str);
}

//several endpoints use the same observer, so we have a function to construct
//it to remove redundancy.
function makeObserver(res, obj){
	const observer = {
		next(row, tableMeta) {
			const o = tableMeta.toObject(row)
			obj[o._measurement].push({sensor: o.sensor, time: o._time, value: o._value});
		},
		complete(){
			res.setHeader('Content-Type', 'aplication/json');
			res.end(JSON.stringify(obj));
		},
		error(err){
			console.log(err);
			send400err("influxDB query error", res);
		}
	};
	return observer;
}

function makeValueObserver(res, obj){
	return {
		next(row, tableMeta) {
			const o = tableMeta.toObject(row)
			obj.values.push({sensor: o.sensor, value: o._value});
			//console.log(o);
		},
		complete(){
			res.setHeader('Content-Type', 'aplication/json');
			res.end(JSON.stringify(obj));
		},
		error(err){
			console.log(err);
			send400err("influxDB query error", res);
		}
	};
}

function apiReq(path, res){
	u = new URL(path, `http://${config.server.hostname}`);
	res.setHeader('Access-Control-Allow-Origin', '*');
	//console.log(u);
	//call function for specific api endpoints
	if(u.pathname == '/api/recent')apiRecent(res);
	else if(u.pathname == '/api/recent/noiseReading')apiRecentNoise(res);
	else if(u.pathname == '/api/recent/motionReading')apiRecentMotion(res);
	else if(u.pathname == '/api/since')apiSince(u, res);
	else if(u.pathname == '/api/noiseReading/average')apiNoiseAverage(u, res);
	else if(u.pathname == '/api/noiseReading/max')apiNoiseMax(u, res);
	else if(u.pathname == '/api/grouped')apiGroup(u, res);
	else{
		send400err(`Unrecognised endpoint: ${u}`, res);
	}
}

function apiRecent(res){
	let obj = {
		noiseReading : [],
		motionReading : []};
	const q = //querys are writen in flux, a language created for influxDB
		`from(bucket: "${config.influxDB.bucket}")
		|> range(start: 0)
		|> last()`;
	const observer = makeObserver(res, obj);
	queryApi.queryRows(q, observer);
}

function apiRecentNoise(res){
	/********************************************
	NOTE: the way this query is being constructed
	is NOT SECURE. The inputs are not verified &
	are vulnerable to a code injection attack.
	********************************************/
	let obj = {noiseReading : []};
	let q = 
		`from(bucket: "${config.influxDB.bucket}")
		|> range(start: 0)
		|> filter(fn: (r) => r._measurement == "noiseReading")`;
	if(u.searchParams.has('s'))q += `|> filter(fn: (r) => r.sensor == "${u.searchParams.get('s')}")`;
	if(u.searchParams.has('a'))q += `|> filter(fn: (r) => r._value > ${u.searchParams.get('a')})`;
	if(u.searchParams.has('b'))q += `|> filter(fn: (r) => r._value < ${u.searchParams.get('b')})`;
	q += `|> last()`;
	const observer = makeObserver(res, obj);
	queryApi.queryRows(q, observer);
}

function apiRecentMotion(res){
	/********************************************
	NOTE: the way this query is being constructed
	is NOT SECURE. The inputs are not verified &
	are vulnerable to a code injection attack.
	********************************************/
	let obj = {motionReading : []};
	let q = 
		`from(bucket: "${config.influxDB.bucket}")
		|> range(start: 0)
		|> filter(fn: (r) => r._measurement == "motionReading")`;
	if(u.searchParams.has('s'))q += `|> filter(fn: (r) => r.sensor == "${u.searchParams.get('s')}")`;
	if(u.searchParams.has('v'))q += `|> filter(fn: (r) => r._value == ${u.searchParams.get('v')})`;
	q += `|> last()`;
	const observer = makeObserver(res, obj);
	queryApi.queryRows(q, observer);
}

function apiSince(u, res){
	/********************************************
	NOTE: the way this query is being constructed
	is NOT SECURE. The inputs are not verified &
	are vulnerable to a code injection attack.
	********************************************/
	let obj;
	let q = 
		`from(bucket: "${config.influxDB.bucket}")
		|> range(start: time(v: "${u.searchParams.get('t')}"))`;
	if(u.searchParams.has('s'))q += `|> filter(fn: (r) => r.sensor == "${u.searchParams.get('s')}")`;
	if(u.searchParams.has('r')){
		if(u.searchParams.get('r')=='noiseReading'){
			q += `|> filter(fn: (r) => r._measurement == "noiseReading")`;
			obj = {noiseReading : []};
		} else if(u.searchParams.get('r')=='motionReading'){
			q += `|> filter(fn: (r) => r._measurement == "motionReading")`;
			obj = {motionReading : []};
		} else {
			send400err('invalid reading paramenter', res);
			return;
		}
	} else {
		obj = {
			noiseReading : [],
			motionReading : []};
	}
	//console.log(q);
	const observer = makeObserver(res, obj);
	queryApi.queryRows(q, observer);
}

function apiNoiseAverage(u, res){
	/********************************************
	NOTE: the way this query is being constructed
	is NOT SECURE. The inputs are not verified &
	are vulnerable to a code injection attack.
	********************************************/
	let q =
		`from(bucket: "${config.influxDB.bucket}")
		|> range(start: time(v: "${u.searchParams.get('start')}"), stop:${u.searchParams.has('stop')?'time(v: "'+u.searchParams.get('stop')+'")':'now()'})
		|> filter(fn: (r) => r._measurement == "noiseReading")`;
	if(u.searchParams.has('s'))q += `|> filter(fn: (r) => r.sensor == "${u.searchParams.get('s')}")`;
	q += `
		|> keep(columns: ["_value", "sensor"])
		|> mean()`;
	//console.log(q);
	let obj = {values: []};
	const observer = makeValueObserver(res, obj);
	queryApi.queryRows(q, observer);
}

function apiNoiseMax(u, res){
	/********************************************
	NOTE: the way this query is being constructed
	is NOT SECURE. The inputs are not verified &
	are vulnerable to a code injection attack.
	********************************************/
	let q =
		`from(bucket: "${config.influxDB.bucket}")
		|> range(start: time(v: "${u.searchParams.get('start')}"), stop:${u.searchParams.has('stop')?'time(v: "'+u.searchParams.get('stop')+'")':'now()'})
		|> filter(fn: (r) => r._measurement == "noiseReading")`;
	if(u.searchParams.has('s'))q += `|> filter(fn: (r) => r.sensor == "${u.searchParams.get('s')}")`;
	q += `
		|> keep(columns: ["_value", "sensor"])
		|> max()`;
	let obj = {values: []};
	const observer = makeValueObserver(res, obj);
	queryApi.queryRows(q, observer);
}

function apiGroup(u, res){
	/********************************************
	NOTE: the way this query is being constructed
	is NOT SECURE. The inputs are not verified &
	are vulnerable to a code injection attack.
	********************************************/
	let obj;
	let q = 
		`from(bucket: "${config.influxDB.bucket}")
		|> range(start: time(v: "${u.searchParams.get('t')}"))`;
	if(u.searchParams.has('s'))q += `|> filter(fn: (r) => r.sensor == "${u.searchParams.get('s')}")`;
	if(u.searchParams.has('r')){
		if(u.searchParams.get('r')=='noiseReading'){
			q += `|> filter(fn: (r) => r._measurement == "noiseReading")`;
			obj = {noiseReading : []};
		} else if(u.searchParams.get('r')=='motionReading'){
			q += `|> filter(fn: (r) => r._measurement == "motionReading")`;
			obj = {motionReading : []};
		} else {
			send400err('invalid reading paramenter', res);
			return;
		}
	} else {
		obj = {
			noiseReading : [],
			motionReading : []};
	}
	q += `|> aggregateWindow(every: ${u.searchParams.get('p')}s, fn: mean, createEmpty: false)`;
	//console.log(q);
	const observer = makeObserver(res, obj);
	queryApi.queryRows(q, observer);
}

function optionsResponse(res){
	res.setHeader('Access-Control-Allow-Origin','*');
	res.setHeader('Access-Control-Allow-Methods','*');
	res.end();
}

//create server, for each request call either sendfile(filename, res) or apiReq(url, res)
const server = http.createServer((req, res) => {
	res.statusCode = 200;
	if(req.method == 'OPTIONS')optionsResponse(res);
	else if(req.url == '/')sendFile(config.server.index, res);
	else if(req.url.startsWith('/api/'))apiReq(req.url, res);
	else{
		sendFile(config.server.files + req.url, res);
	}
});

server.listen(config.server.port, config.server.hostname, () => {
	console.log(`Server running at http://${config.server.hostname}:${config.server.port}/`);
});
