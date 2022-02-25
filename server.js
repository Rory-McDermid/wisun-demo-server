const http = require('http');
const fs = require('fs');
const url = require('url');

const hostname = '127.0.0.1';
const port = 3000;

const readingTypes = ['noiseReading', 'motionReading'];

const {InfluxDB, Point} = require('@influxdata/influxdb-client')
const token = "8MkGu8tDM4AHKB69seAD_2mkaOxYlO7CR0xVP-UcQIkI2GnWJwiZ1TkLEq9nrHmjbU4Rj_BmsfarBqenAcjO7w=="
const org = 'rmm180000@utdallas.edu'
const bucket = 'mock_I'
const client = new InfluxDB({url: 'https://us-east-1-1.aws.cloud2.influxdata.com', token: token})

queryApi = client.getQueryApi(org);

function sendFile(fileLoc, res){
	const stream = fs.createReadStream(fileLoc);
	stream.on('error', (err) => {
		res.writeHead(404, 'Not Found');
		res.end('404');
	});
	res.setHeader('Content-Type', 'text/html');
	stream.pipe(res);
}

function apiReq(path, res){
	u = new URL(path, 'http://localhost');
	if(u.pathname == '/api/recent')apiRecent(res);
	else{
		res.setHeader('Content-Type', 'text/plain');
		res.end('api req ' + u);
	}
}

function apiRecent(res){
	let obj = {//test object
		noiseReading : [
			//{sensor : '1', time : 0, value: 42.24}
		],
		motionReading : [
			//{sensor : '1', time : 0, value: 42.24}
		]};
	const q =
		'from(bucket: "mock_II")\
		|> range(start: 0)\
		|> last()';
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
			res.writeHead(400, 'error');
			res.end('400');
		}
	};
	queryApi.queryRows(q, observer);
	//res.setHeader('Content-Type', 'aplication/json');
	//res.end("err");
}

function apiSince(u, res){
	
}

const server = http.createServer((req, res) => {
	res.statusCode = 200;
	if(req.url == '/')sendFile('index.html', res);
	else if(req.url.startsWith('/api/'))apiReq(req.url, res);
	else{
		sendFile('static' + req.url, res);
		//res.setHeader('Content-Type', 'text/plain');
		//res.end('Hello World');
	}
});

server.listen(port, hostname, () => {
	console.log(`Server running at http://${hostname}:${port}/`);
});
