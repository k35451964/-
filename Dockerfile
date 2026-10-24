# Cloudtype 배포용: 정적 파일을 nginx로 그대로 제공한다 (포트 80)
FROM nginx:1.27-alpine
COPY index.html teacher.html *.css *.js /usr/share/nginx/html/
EXPOSE 80
