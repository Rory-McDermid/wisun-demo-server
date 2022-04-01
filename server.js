const http = require('http');
const fs = require('fs');
const url = require('url');

var config = require('./config.json'); //load configuration file
config.server.port = process.env.PORT || config.server.port

//const readingTypes = ['noiseReading', 'motionReading'];

const {InfluxDB, Point} = require('@influxdata/influxdb-client')
const client = new InfluxDB({url: config.influxDB.url, token: config.influxDB.token})

queryApi = client.getQueryApi(config.influxDB.org);

regex_sensor = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
regex_nValue = /^-?([0-9]*[.])?[0-9]+$/;
regex_mValue = /^[01]$/;
regex_time = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}Z)?$/
regex_reading = /^(motionReading)|(noiseReading)$/;
regex_int = /^\d*[1-9]\d*$/;

function validateInput(u){
	v = false;
	if(u.searchParams.has('s') && !(regex_sensor.test(u.searchParams.get('s'))))
		v = `invalid sensor: ${u.searchParams.get('s')}`;
	if(u.searchParams.has('t') && !(regex_time.test(u.searchParams.get('t'))))
		v = `invalid time(t): ${u.searchParams.get('t')}`;
	if(u.searchParams.has('start') && !(regex_time.test(u.searchParams.get('start'))))
		v = `invalid time(start): ${u.searchParams.get('start')}`;
	if(u.searchParams.has('stop') && !(regex_time.test(u.searchParams.get('stop'))))
		v = `invalid time(stop): ${u.searchParams.get('stop')}`;
	if(u.searchParams.has('a') && !(regex_nValue.test(u.searchParams.get('a'))))
		v = `invalid noise value(a): ${u.searchParams.get('a')}`;
	if(u.searchParams.has('b') && !(regex_nValue.test(u.searchParams.get('b'))))
		v = `invalid noise value(b): ${u.searchParams.get('b')}`;
	if(u.searchParams.has('v') && !(regex_mValue.test(u.searchParams.get('v'))))
		v = `invalid motion value: ${u.searchParams.get('v')}`;
	if(u.searchParams.has('r') && !(regex_reading.test(u.searchParams.get('r'))))
		v = `invalid reading: ${u.searchParams.get('r')}`;
	if(u.searchParams.has('p') && !(regex_int.test(u.searchParams.get('p'))))
		v = `invalid period: ${u.searchParams.get('p')}`;
	return v;
}

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
	v = validateInput(u);
	if(v){
		send400err(v, res);
		return;
	}
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
