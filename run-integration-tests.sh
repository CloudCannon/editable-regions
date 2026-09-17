cd test/integrations/
ls | while read dir; do
    echo $dir
    echo "Running tests for $dir"
    cd $dir
    (npm ci && npm run build) || exit 1
    cd ..
done
